import { client, json, bearer } from "./_client.js";

async function requireAdmin(req) {
  const token = bearer(req);
  const db = client(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || data.user?.app_metadata?.role !== "admin") throw new Error("Unauthorized");
  return db;
}

function normalizeSlug(value) {
  return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `product-${crypto.randomUUID().slice(0, 8)}`;
}

async function uniqueProductSlug(db, requestedSlug, excludedId = null) {
  const base = normalizeSlug(requestedSlug);
  let query = db.from("products").select("slug").like("slug", `${base}%`);
  if (excludedId) query = query.neq("id", excludedId);
  const { data, error } = await query;
  if (error) throw error;
  const used = new Set((data || []).map(product => product.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

async function createBundleProducts(db, products = []) {
  const created = [];
  for (const [index, item] of products.entries()) {
    const { variant, quantity, ...fields } = item;
    const product = {
      ...fields,
      slug: await uniqueProductSlug(db, fields.name),
      image_url: fields.image_url || "assets/images/cura-care-logo.png",
      is_active: true,
      is_bestseller: false,
      is_offer: false,
      sort_order: 900 + index
    };
    const { data: createdProduct, error: productError } = await db.from("products").insert(product).select("id").single();
    if (productError) throw productError;
    created.push(createdProduct.id);
    const { data: createdVariant, error: variantError } = await db.from("product_variants")
      .insert({ ...variant, product_id: createdProduct.id, sort_order: 0 })
      .select("id").single();
    if (variantError) throw variantError;
    created[created.length - 1] = { productId: createdProduct.id, variant_id: createdVariant.id, quantity };
  }
  return created;
}

function productImageStoragePath(url) {
  const marker = "/storage/v1/object/public/product-images/";
  const value = String(url || "");
  const markerIndex = value.indexOf(marker);
  if (markerIndex === -1) return null;
  try { return decodeURIComponent(value.slice(markerIndex + marker.length).split("?")[0]); }
  catch { return null; }
}

async function removeUnusedProductImages(db, urls = []) {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  const removablePaths = [];
  for (const url of uniqueUrls) {
    const path = productImageStoragePath(url);
    if (!path) continue;
    const { count, error } = await db.from("products").select("id", { count: "exact", head: true }).eq("image_url", url);
    if (error) throw error;
    if (!count) removablePaths.push(path);
  }
  if (removablePaths.length) {
    const { error } = await db.storage.from("product-images").remove(removablePaths);
    if (error) throw error;
  }
}

export default async function handler(req, res) {
  try {
    const db = await requireAdmin(req);
    const action = req.query.action || req.body?.action;
    if (req.method === "GET" && action === "dashboard") {
      const [products, orders, settings, deliveryHistory, bundleItems] = await Promise.all([
        db.from("products").select("*, product_variants(*)").order("sort_order"),
        db.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(100),
        db.from("store_settings").select("*").eq("id", 1).single(),
        db.from("delivery_rate_history").select("*").order("created_at", { ascending: false }).limit(30),
        db.from("product_bundle_items").select("*").order("sort_order")
      ]);
      const error = products.error || orders.error || settings.error;
      if (error) throw error;
      return json(res, 200, { products: products.data, orders: orders.data, settings: settings.data, deliveryHistory: deliveryHistory.data || [], bundleItems: bundleItems.data || [] });
    }
    if (req.method === "GET" && action === "payment-proof") {
      const path = String(req.query.path || "");
      if (!path.startsWith("incoming/")) return json(res, 400, { error: "Invalid payment proof path" });
      const extension = path.split(".").pop() || "jpg";
      const options = req.query.download === "1" ? { download: `cura-payment-proof-${Date.now()}.${extension}` } : undefined;
      const { data, error } = await db.storage.from("payment-proofs").createSignedUrl(path, 300, options);
      if (error) throw error;
      return json(res, 200, { url: data.signedUrl });
    }
    if (req.method === "PATCH" && action === "product-status") {
      const { id, is_active } = req.body || {};
      if (!id || typeof is_active !== "boolean") return json(res, 400, { error: "Invalid product status request" });
      const { data, error } = await db.from("products").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json(res, 404, { error: "Product not found" });
      return json(res, 200, { ok: true, id: data.id, is_active });
    }
    if (req.method === "POST" && action === "product") {
      const { variants = [], bundleItems = [], newProducts = [], removedVariantIds = [], ...product } = req.body.product;
      if (!variants.length) throw new Error("Every product needs at least one size.");
      product.slug = await uniqueProductSlug(db, product.slug || product.name);
      const { data, error } = await db.from("products").insert(product).select().single();
      if (error) throw error;
      if (variants.length) {
        const { error: variantError } = await db.from("product_variants").insert(variants.map((variant, index) => {
          const { id: ignoredId, ...cleanVariant } = variant;
          return { ...cleanVariant, product_id: data.id, sort_order: index };
        }));
        if (variantError) {
          await db.from("products").delete().eq("id", data.id);
          throw variantError;
        }
      }
      if (product.badge === "PACKAGE" && (bundleItems.length || newProducts.length)) {
        const createdItems = await createBundleProducts(db, newProducts);
        const allItems = [...bundleItems, ...createdItems];
        const { error: bundleError } = await db.from("product_bundle_items").insert(allItems.map((item, index) => ({ bundle_product_id: data.id, component_variant_id: item.variant_id, quantity: item.quantity, sort_order: index })));
        if (bundleError) throw bundleError;
      }
      return json(res, 201, { product: data });
    }
    if (req.method === "PATCH" && action === "product") {
      const { id, variants = [], bundleItems = [], newProducts = [], removedVariantIds = [], ...product } = req.body.product;
      if (!id) throw new Error("Missing product id.");
      if (!variants.length) throw new Error("Every product needs at least one size.");
      product.slug = await uniqueProductSlug(db, product.slug || product.name, id);
      const { data: updatedProduct, error } = await db.from("products").update(product).eq("id", id).select("id").maybeSingle();
      if (error) throw error;
      if (!updatedProduct) throw new Error("This product no longer exists. Refresh the dashboard before saving.");
      for (const [index, variant] of variants.entries()) {
        const { id: variantId, ...cleanVariant } = variant;
        const result = variantId
          ? await db.from("product_variants").update({ ...cleanVariant, sort_order: index }).eq("id", variantId).eq("product_id", id).select("id").maybeSingle()
          : await db.from("product_variants").insert({ ...cleanVariant, product_id: id, sort_order: index }).select("id").single();
        if (result.error) throw result.error;
        if (!result.data) throw new Error("A size was changed elsewhere. Refresh the dashboard and try again.");
      }
      if (removedVariantIds.length) {
        const { error: removeVariantError } = await db.from("product_variants").delete().eq("product_id", id).in("id", removedVariantIds);
        if (removeVariantError) throw new Error("A removed size is used inside a package. Remove it from the package first.");
      }
      if (product.badge === "PACKAGE") {
        const { error: clearBundleError } = await db.from("product_bundle_items").delete().eq("bundle_product_id", id);
        if (clearBundleError) throw clearBundleError;
        if (bundleItems.length || newProducts.length) {
          const createdItems = await createBundleProducts(db, newProducts);
          const allItems = [...bundleItems, ...createdItems];
          const { error: bundleError } = await db.from("product_bundle_items").insert(allItems.map((item, index) => ({ bundle_product_id: id, component_variant_id: item.variant_id, quantity: item.quantity, sort_order: index })));
          if (bundleError) throw bundleError;
        }
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === "DELETE" && action === "product") {
      const { data, error } = await db.from("products").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", req.query.id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json(res, 404, { error: "Product not found" });
      return json(res, 200, { ok: true, archived: true });
    }
    if (req.method === "DELETE" && action === "product-permanent") {
      const id = String(req.query.id || "");
      const { data: product, error: productError } = await db.from("products").select("id,name,image_url,is_active,badge").eq("id", id).maybeSingle();
      if (productError) throw productError;
      if (!product) return json(res, 404, { error: "Product not found" });
      if (product.is_active) return json(res, 400, { error: "Archive the product before deleting it permanently." });

      const { data: variants, error: variantsError } = await db.from("product_variants").select("id").eq("product_id", id);
      if (variantsError) throw variantsError;
      const variantIds = (variants || []).map(variant => variant.id);
      if (variantIds.length) {
        const { count, error: usageError } = await db.from("product_bundle_items").select("id", { count: "exact", head: true }).in("component_variant_id", variantIds);
        if (usageError) throw usageError;
        if (count) return json(res, 409, { error: "This product is used inside a package. Remove it from the package first." });
      }

      const imagesToClean = [product.image_url];
      if (product.badge === "PACKAGE") {
        const { data: links, error: linksError } = await db.from("product_bundle_items").select("component_variant_id").eq("bundle_product_id", id);
        if (linksError) throw linksError;
        const componentVariantIds = (links || []).map(link => link.component_variant_id);
        if (componentVariantIds.length) {
          const { data: componentVariants, error: componentsError } = await db.from("product_variants").select("product_id").in("id", componentVariantIds);
          if (componentsError) throw componentsError;
          const componentIds = [...new Set((componentVariants || []).map(variant => variant.product_id))];
          if (componentIds.length) {
            const { data: components, error: componentProductsError } = await db.from("products").select("id,image_url,category").in("id", componentIds);
            if (componentProductsError) throw componentProductsError;
            product.componentProducts = (components || []).filter(component => component.category === "__package_component__");
            imagesToClean.push(...product.componentProducts.map(component => component.image_url));
          }
        }
      }

      const { error: deleteError } = await db.from("products").delete().eq("id", id);
      if (deleteError) throw deleteError;
      for (const component of product.componentProducts || []) {
        const { count, error: componentUsageError } = await db.from("product_bundle_items").select("id", { count: "exact", head: true }).in("component_variant_id", (await db.from("product_variants").select("id").eq("product_id", component.id)).data?.map(item => item.id) || []);
        if (componentUsageError) throw componentUsageError;
        if (!count) {
          const { error } = await db.from("products").delete().eq("id", component.id);
          if (error) throw error;
        }
      }
      await removeUnusedProductImages(db, imagesToClean);
      return json(res, 200, { ok: true, deleted: true });
    }
    if (req.method === "PATCH" && action === "order") {
      if (req.body.status === "cancelled") {
        const { error } = await db.rpc("cancel_order", { p_order_id: req.body.id });
        if (error) throw error;
        return json(res, 200, { ok: true, cancelled: true });
      }
      const { error } = await db.from("orders").update({ status: req.body.status, updated_at: new Date().toISOString() }).eq("id", req.body.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    if (req.method === "DELETE" && action === "order") {
      const { data: order, error: orderError } = await db.from("orders").select("payment_proof_path,status").eq("id", req.query.id).single();
      if (orderError) throw orderError;
      if (order.status !== "delivered" && order.status !== "cancelled") return json(res, 400, { error: "Only delivered or cancelled orders can be deleted" });
      if (order.payment_proof_path) {
        const { error: storageError } = await db.storage.from("payment-proofs").remove([order.payment_proof_path]);
        if (storageError) throw storageError;
      }
      const { error } = await db.from("orders").delete().eq("id", req.query.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    if (req.method === "DELETE" && action === "payment-proof") {
      const { data: order, error: orderError } = await db.from("orders").select("payment_proof_path").eq("id", req.query.id).single();
      if (orderError) throw orderError;
      if (order.payment_proof_path) {
        const { error: storageError } = await db.storage.from("payment-proofs").remove([order.payment_proof_path]);
        if (storageError) throw storageError;
      }
      const { error } = await db.from("orders").update({ payment_proof_path: null, updated_at: new Date().toISOString() }).eq("id", req.query.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    if (req.method === "PATCH" && action === "settings") {
      if (Array.isArray(req.body.settings?.delivery_rates)) {
        const { data: current, error: currentError } = await db.from("store_settings").select("delivery_rates").eq("id", 1).single();
        if (currentError) throw currentError;
        const before = Array.isArray(current.delivery_rates) ? current.delivery_rates : [];
        const after = req.body.settings.delivery_rates;
        const names = new Set([...before, ...after].map(rate => rate.governorate));
        const changes = [...names].map(governorate => {
          const oldRate = before.find(rate => rate.governorate === governorate);
          const newRate = after.find(rate => rate.governorate === governorate);
          if (Number(oldRate?.fee) === Number(newRate?.fee) && Boolean(oldRate) === Boolean(newRate)) return null;
          return { governorate, old_fee: oldRate?.fee ?? null, new_fee: newRate?.fee ?? null };
        }).filter(Boolean);
        if (changes.length) {
          const { error: historyError } = await db.from("delivery_rate_history").insert(changes);
          if (historyError) throw historyError;
        }
      }
      const { error } = await db.from("store_settings").update({ ...req.body.settings, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    json(res, 400, { error: "Unknown action" });
  } catch (error) { json(res, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}

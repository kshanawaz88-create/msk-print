[35mcontrollers/printAgentAuthController.js[m[36m:[m[32m18[m[36m:[m  const identifiers = [{ [1;31mshopCode[m: value.toUpperCase() }];
[35mcontrollers/printAgentAuthController.js[m[36m:[m[32m21[m[36m:[m    .select("_id shopName [1;31mshopCode[m");
[35mcontrollers/printAgentAuthController.js[m[36m:[m[32m26[m[36m:[m    .select("_id shopName [1;31mshopCode[m")
[35mcontrollers/printAgentAuthController.js[m[36m:[m[32m31[m[36m:[m    [1;31mshopCode[m: shop.[1;31mshopCode[m || "",
[35mcontrollers/printAgentAuthController.js[m[36m:[m[32m51[m[36m:[m      requestedShop.toUpperCase() !== String(shop.[1;31mshopCode[m || "").toUpperCase()
[35mcontrollers/printAgentAuthController.js[m[36m:[m[32m83[m[36m:[m  return Shop.findById(shops[0].id).select("_id shopName [1;31mshopCode[m");
[35mcontrollers/printAgentAuthController.js[m[36m:[m[32m116[m[36m:[m      [1;31mshopCode[m: shop.[1;31mshopCode[m || "",
[35mmiddleware/printAgentAuth.js[m[36m:[m[32m54[m[36m:[m      Shop.findOne({ _id: decoded.shopId, isActive: true }).select("shopName [1;31mshopCode[m"),
[35mmodels/Shop.js[m[36m:[m[32m71[m[36m:[m    [1;31mshopCode[m: {
[35mmodels/Shop.js[m[36m:[m[32m242[m[36m:[m  if (this.[1;31mshopCode[m) {
[35mmodels/Shop.js[m[36m:[m[32m243[m[36m:[m    this.[1;31mshopCode[m = this.[1;31mshopCode[m
[35mmodels/Shop.js[m[36m:[m[32m248[m[36m:[m    if (!this.[1;31mshopCode[m) {
[35mmodels/Shop.js[m[36m:[m[32m259[m[36m:[m      [1;31mshopCode[m: candidate,
[35mmodels/Shop.js[m[36m:[m[32m266[m[36m:[m      this.[1;31mshopCode[m = candidate;
[35mroutes/publicPaymentRoutes.js[m[36m:[m[32m42[m[36m:[m  const [1;31mshopCode[m = typeof body?.[1;31mshopCode[m === "string"
[35mroutes/publicPaymentRoutes.js[m[36m:[m[32m43[m[36m:[m    ? body.[1;31mshopCode[m.trim().toUpperCase()
[35mroutes/publicPaymentRoutes.js[m[36m:[m[32m46[m[36m:[m  if (!/^[a-f0-9]{64}$/i.test(orderToken) || !/^[A-Z0-9-]{3,50}$/.test([1;31mshopCode[m)) {
[35mroutes/publicPaymentRoutes.js[m[36m:[m[32m54[m[36m:[m  const shopSummary = await Shop.findOne({ [1;31mshopCode[m, isActive: true }).select("_id");
[35mroutes/publicPaymentRoutes.js[m[36m:[m[32m72[m[36m:[m  if (!shop || shop.isActive === false || shop.[1;31mshopCode[m !== [1;31mshopCode[m) {
[35mroutes/publicRoutes.js[m[36m:[m[32m89[m[36m:[mconst findPublicShop = ([1;31mshopCode[m) =>
[35mroutes/publicRoutes.js[m[36m:[m[32m91[m[36m:[m    [1;31mshopCode[m,
[35mroutes/publicRoutes.js[m[36m:[m[32m377[m[36m:[m// GET /api/public/shops/:[1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m381[m[36m:[m  "/shops/:[1;31mshopCode[m",
[35mroutes/publicRoutes.js[m[36m:[m[32m384[m[36m:[m      const [1;31mshopCode[m = normalizeShopCode(
[35mroutes/publicRoutes.js[m[36m:[m[32m385[m[36m:[m        req.params.[1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m388[m[36m:[m      if (!validShopCode([1;31mshopCode[m)) {
[35mroutes/publicRoutes.js[m[36m:[m[32m396[m[36m:[m        [1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m400[m[36m:[m          "[1;31mshopCode[m",
[35mroutes/publicRoutes.js[m[36m:[m[32m435[m[36m:[m          [1;31mshopCode[m: shop.[1;31mshopCode[m,
[35mroutes/publicRoutes.js[m[36m:[m[32m472[m[36m:[m// POST /api/public/shops/:[1;31mshopCode[m/quote
[35mroutes/publicRoutes.js[m[36m:[m[32m476[m[36m:[m  "/shops/:[1;31mshopCode[m/quote",
[35mroutes/publicRoutes.js[m[36m:[m[32m479[m[36m:[m      const [1;31mshopCode[m = normalizeShopCode(
[35mroutes/publicRoutes.js[m[36m:[m[32m480[m[36m:[m        req.params.[1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m483[m[36m:[m      if (!validShopCode([1;31mshopCode[m)) {
[35mroutes/publicRoutes.js[m[36m:[m[32m491[m[36m:[m        [1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m565[m[36m:[m// POST /api/public/shops/:[1;31mshopCode[m/orders
[35mroutes/publicRoutes.js[m[36m:[m[32m569[m[36m:[m  "/shops/:[1;31mshopCode[m/orders",
[35mroutes/publicRoutes.js[m[36m:[m[32m578[m[36m:[m      const [1;31mshopCode[m = normalizeShopCode(
[35mroutes/publicRoutes.js[m[36m:[m[32m579[m[36m:[m        req.params.[1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m582[m[36m:[m      if (!validShopCode([1;31mshopCode[m)) {
[35mroutes/publicRoutes.js[m[36m:[m[32m593[m[36m:[m        [1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m595[m[36m:[m        "_id shopName [1;31mshopCode[m currency paymentEnabled"
[35mroutes/publicRoutes.js[m[36m:[m[32m762[m[36m:[m            [1;31mshopCode[m: shop.[1;31mshopCode[m,
[35mroutes/publicRoutes.js[m[36m:[m[32m803[m[36m:[m// GET /api/public/orders/:orderToken?[1;31mshopCode[m=MSK-ABC001
[35mroutes/publicRoutes.js[m[36m:[m[32m815[m[36m:[m      const [1;31mshopCode[m = normalizeShopCode(
[35mroutes/publicRoutes.js[m[36m:[m[32m816[m[36m:[m        req.query.[1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m826[m[36m:[m      if (!validShopCode([1;31mshopCode[m)) {
[35mroutes/publicRoutes.js[m[36m:[m[32m871[m[36m:[m        shop.[1;31mshopCode[m !== [1;31mshopCode[m
[35mroutes/publicRoutes.js[m[36m:[m[32m919[m[36m:[m            [1;31mshopCode[m: shop.[1;31mshopCode[m,
[35mroutes/publicRoutes.js[m[36m:[m[32m926[m[36m:[m          [1;31mshopCode[m: shop.[1;31mshopCode[m,
[35msocket.js[m[36m:[m[32m162[m[36m:[m        [1;31mshopCode[m
[35msocket.js[m[36m:[m[32m180[m[36m:[m          const [1;31mshopCode[m =
[35msocket.js[m[36m:[m[32m182[m[36m:[m              payload.[1;31mshopCode[m
[35msocket.js[m[36m:[m[32m189[m[36m:[m            !isValidShopCode([1;31mshopCode[m)
[35msocket.js[m[36m:[m[32m209[m[36m:[m              [1;31mshopCode[m,
[35mtests/paymentHardening.test.js[m[36m:[m[32m120[m[36m:[m  const access = { orderToken: publicToken, [1;31mshopCode[m: shop.[1;31mshopCode[m };
[35mtests/printAgent.test.js[m[36m:[m[32m36[m[36m:[m      [1;31mshopCode[m: "AGENT-A",
[35mtests/printAgent.test.js[m[36m:[m[32m42[m[36m:[m      [1;31mshopCode[m: "AGENT-B",
[35mtests/printAgent.test.js[m[36m:[m[32m110[m[36m:[m    shopId: shop.[1;31mshopCode[m,
[35mtests/printAgent.test.js[m[36m:[m[32m181[m[36m:[m    shopId: actors.shopA.[1;31mshopCode[m,
[35mtests/printAgent.test.js[m[36m:[m[32m276[m[36m:[m    shopId: actors.shopA.[1;31mshopCode[m,
[35mtests/printAgent.test.js[m[36m:[m[32m281[m[36m:[m    shopId: actors.shopA.[1;31mshopCode[m,
[35mtests/printAgent.test.js[m[36m:[m[32m286[m[36m:[m    shopId: actors.shopB.[1;31mshopCode[m,
[35mtests/printAgent.test.js[m[36m:[m[32m536[m[36m:[m    shopId: actors.shopB.[1;31mshopCode[m,
[35mtests/printAgent.test.js[m[36m:[m[32m600[m[36m:[m    shopId: actors.shopA.[1;31mshopCode[m,
[35mtests/printAgent.test.js[m[36m:[m[32m656[m[36m:[m    shopId: actors.shopB.[1;31mshopCode[m,
[35mtests/publicPricing.test.js[m[36m:[m[32m50[m[36m:[m    [1;31mshopCode[m: "PUBLIC-A",
[35mtests/publicPricing.test.js[m[36m:[m[32m56[m[36m:[m    [1;31mshopCode[m: "PUBLIC-B",
[35mtests/publicPricing.test.js[m[36m:[m[32m115[m[36m:[m  [1;31mshopCode[m,
[35mtests/publicPricing.test.js[m[36m:[m[32m125[m[36m:[m    .post(`/api/public/shops/${[1;31mshopCode[m}/orders`)
[35mtests/publicPricing.test.js[m[36m:[m[32m197[m[36m:[m    .post(`/api/public/shops/${users.shopA.[1;31mshopCode[m}/quote`)
[35mtests/publicPricing.test.js[m[36m:[m[32m200[m[36m:[m    .post(`/api/public/shops/${users.shopB.[1;31mshopCode[m}/quote`)
[35mtests/publicPricing.test.js[m[36m:[m[32m242[m[36m:[m    const first = await orderRequest(shopA.[1;31mshopCode[m);
[35mtests/publicPricing.test.js[m[36m:[m[32m243[m[36m:[m    const second = await orderRequest(shopA.[1;31mshopCode[m, validPng(), "second.png", {});
[35mtests/publicPricing.test.js[m[36m:[m[32m273[m[36m:[m      .post(`/api/public/shops/${shopA.[1;31mshopCode[m}/orders`)
[35mtests/publicPricing.test.js[m[36m:[m[32m279[m[36m:[m      shopA.[1;31mshopCode[m,
[35mtests/publicPricing.test.js[m[36m:[m[32m283[m[36m:[m    const mismatched = await orderRequest(shopA.[1;31mshopCode[m, validPng(), "wrong.pdf");
[35mtests/publicPricing.test.js[m[36m:[m[32m285[m[36m:[m      shopA.[1;31mshopCode[m,
[35mtests/publicPricing.test.js[m[36m:[m[32m315[m[36m:[m      const response = await orderRequest(shopA.[1;31mshopCode[m);
[35mtests/publicPricing.test.js[m[36m:[m[32m370[m[36m:[m    .query({ [1;31mshopCode[m: shopA.[1;31mshopCode[m });
[35mtests/publicPricing.test.js[m[36m:[m[32m373[m[36m:[m    .query({ [1;31mshopCode[m: shopA.[1;31mshopCode[m });

const TYCOON_ASSET_ROOT = "https://tycoontoys.in/assets/products";

export type OrderItemThumbnail = {
  src: string;
  representative: boolean;
};

type OrderItemLike = {
  name?: string | null;
  category?: string | null;
};

function productImage(path: string) {
  return `${TYCOON_ASSET_ROOT}/${path}`;
}

const images = {
  astroCar: productImage("rockers-riders/astro-car/green/main.jpg"),
  avenger: productImage("bikes/fr-009-avenger/red/angled.jpg"),
  avengerLimited: productImage("bikes/fr-009-avenger-le/red/angled.jpg"),
  bmwBike: productImage("bikes/bwm-bike/yellow/main.jpg"),
  charlieDlx: productImage("rockers-riders/charlie-dlx/green/main.jpg"),
  cocoCar: productImage("rockers-riders/coco-car/green/main.jpg"),
  cruzer: productImage("bikes/cruzer/aqua/main.jpg"),
  dl6188: productImage("jeeps/dl-6188/thumbnail.jpg"),
  dreamCar: productImage("cars/dream-car/thumbnail.jpg"),
  dreamCarPaint: productImage("cars/dream-car-paint/thumbnail.jpg"),
  dreamCarPolice: productImage("cars/dream-car-police/thumbnail.jpg"),
  everest: productImage("jeeps/everest/thumbnail.jpg"),
  fr2188: productImage("jeeps/fr-2188/thumbnail.jpg"),
  fr406: productImage("jeeps/fr-406/thumbnail.jpg"),
  fr406Paint: productImage("jeeps/fr-406-paint/thumbnail.jpg"),
  fr502Paint: productImage("jeeps/fr-502-paint/thumbnail.jpg"),
  fr606: productImage("jeeps/fr-606/thumbnail.jpg"),
  fr606Paint: productImage("jeeps/fr-606-paint/thumbnail.jpg"),
  fr61Paint: productImage("jeeps/fr-61-paint/thumbnail.jpg"),
  fr728: productImage("jeeps/fr-728/thumbnail.jpg"),
  fr728Paint: productImage("jeeps/fr-728-paint/thumbnail.jpg"),
  fr80Paint: productImage("jeeps/fr-80-paint/thumbnail.jpg"),
  fr900: productImage("jeeps/fr-900/thumbnail.jpg"),
  fr900Wide: productImage("jeeps/fr-900-plus/thumbnail.jpg"),
  heroBike: productImage("bikes/hero-bike/red/main.jpg"),
  luckyBike: productImage("bikes/lucky-bike/red/main.jpg"),
  champBike: productImage("bikes/champ-bike/white/main.jpg"),
  machoBike: productImage("bikes/macho-bike/red/main.jpg"),
  mountainBike: productImage("bikes/mountain-bike/green/main.jpg"),
  miniBike: productImage("bikes/mini-r1/red/main-studio.jpg"),
  peppy: productImage("scooters/peppy/red/main.jpg"),
  pony: productImage("rockers-riders/pony/pista-green/main.jpg"),
  rio: productImage("rockers-riders/rio/green/main.jpg"),
  roboCar: productImage("rockers-riders/robo-car/yellow/main.jpg"),
  smileyCar: productImage("cars/smiley-car/thumbnail.jpg"),
  smileyCarPaint: productImage("cars/smiley-car-paint/thumbnail.jpg"),
  ss888Paint: productImage("jeeps/ss-888-paint/thumbnail.jpg"),
  superBike: productImage("bikes/super-bike/black/main.jpg"),
  swandaCar: productImage("cars/ferarie-car/thumbnail.jpg"),
  swandaCarPaint: productImage("cars/ferarie-car-paint/thumbnail.jpg"),
  swandaCarSmokePaint: productImage("cars/ferarie-car-smoke-paint/thumbnail.jpg"),
  swiggie: productImage("scooters/swiggy/pink/main.jpg"),
  swiggieDlx: productImage("scooters/swiggy-dlx/blue/main.jpg"),
  swiggieDlxPaint: productImage("scooters/swiggy-dlx-paint/grey/main.jpg"),
  swiggiePaint: productImage("scooters/swiggy-paint/blue/main.jpg"),
};

function result(src: string, representative = false): OrderItemThumbnail {
  return { src, representative };
}

function hasAny(name: string, terms: string[]) {
  return terms.some((term) => name.includes(term));
}

/**
 * Resolves an order item to a Tycoon catalogue thumbnail. Exact product
 * matches are preferred; unavailable finishes use the closest family image.
 */
export function resolveOrderItemThumbnail(
  item: OrderItemLike | null | undefined
): OrderItemThumbnail {
  const name = String(item?.name || "").trim().toLowerCase();
  const category = String(item?.category || "").trim().toLowerCase();

  if (!name) return result("/Tycoon_Logo.JPG", true);

  if (name.startsWith("fr-avenger")) {
    return result(
      name.includes("limited edition") ? images.avengerLimited : images.avenger,
      name !== "fr-avenger" && name !== "fr-avenger limited edition"
    );
  }

  if (name.startsWith("swiggie")) {
    const isDlx = name.includes("dlx");
    const isPaintLike = hasAny(name, ["paint", "matte", "remote"]);
    if (isDlx && isPaintLike) return result(images.swiggieDlxPaint, true);
    if (isDlx) return result(images.swiggieDlx, name !== "swiggie dlx");
    if (isPaintLike) return result(images.swiggiePaint, true);
    return result(images.swiggie, name !== "swiggie");
  }

  if (name.startsWith("fr-406")) {
    return result(name.includes("paint") ? images.fr406Paint : images.fr406, name.includes("plus"));
  }
  if (name.startsWith("fr-606")) {
    return result(name.includes("paint") ? images.fr606Paint : images.fr606, hasAny(name, ["2m", "plus"]));
  }
  if (name.startsWith("fr-61")) {
    return result(images.fr61Paint, name !== "fr-61 paint");
  }
  if (name.startsWith("fr-728")) {
    return result(name.includes("paint") ? images.fr728Paint : images.fr728, name.includes("plus"));
  }
  if (name.startsWith("fr-80")) return result(images.fr80Paint, name !== "fr-80 paint");
  if (name.startsWith("fr-502")) return result(images.fr502Paint, name !== "fr-502 paint");
  if (name.startsWith("fr-2188")) return result(images.fr2188);
  if (name.startsWith("fr-everest")) return result(images.everest);
  if (name.startsWith("fr-900")) {
    return result(name.includes("w/l") ? images.fr900Wide : images.fr900, name.includes("paint"));
  }

  if (name.startsWith("fr-208")) return result(images.fr2188, true);
  if (name.startsWith("fr-528")) return result(images.fr502Paint, true);
  if (hasAny(name, ["fr-7688", "fr-7788"])) return result(images.fr900Wide, true);
  if (name.startsWith("fr-788")) return result(images.fr728, true);
  if (name.startsWith("fr-908")) return result(images.fr728, true);
  if (hasAny(name, ["fr-9188", "mdx-007"])) return result(images.fr2188, true);

  if (name.startsWith("fr-1188")) {
    return result(name.includes("paint") ? images.smileyCarPaint : images.smileyCar, true);
  }
  if (name.startsWith("fr-cruzer")) return result(images.cruzer);
  if (name.startsWith("fr-peppy")) return result(images.peppy, name.includes("plus"));

  if (name.startsWith("dl-1100 lucky")) return result(images.luckyBike, name.includes("paint"));
  if (name.startsWith("dl-1100 champ")) return result(images.champBike, name.includes("paint"));
  if (name.startsWith("dl-6188")) return result(images.dl6188);
  if (name.startsWith("dl-666")) return result(images.superBike);
  if (name.startsWith("dl-777")) return result(images.mountainBike);
  if (name.startsWith("dl-99")) return result(images.miniBike, true);
  if (name.startsWith("bmw")) return result(images.bmwBike, name.includes("paint"));
  if (name.startsWith("hero")) return result(images.heroBike, name.includes("paint"));
  if (name.startsWith("macho")) return result(images.machoBike);
  if (name.startsWith("dream car")) {
    if (name.includes("police")) return result(images.dreamCarPolice);
    if (name.includes("paint")) return result(images.dreamCarPaint);
    return result(images.dreamCar);
  }

  if (name.startsWith("ss-888")) return result(images.ss888Paint, name !== "ss-888 paint");
  if (name.startsWith("sw-555")) {
    if (name.includes("smoke")) return result(images.swandaCarSmokePaint, true);
    if (name.includes("paint")) return result(images.swandaCarPaint, true);
    return result(images.swandaCar, true);
  }

  if (name.startsWith("astro")) return result(images.astroCar);
  if (name.startsWith("charlie")) return result(images.charlieDlx);
  if (name.startsWith("coco")) return result(images.cocoCar);
  if (name.startsWith("pony")) return result(images.pony);
  if (name.startsWith("rio")) return result(images.rio);
  if (name.startsWith("robo")) return result(images.roboCar);

  if (category === "small jeep") return result(images.fr406, true);
  if (category === "medium jeep") return result(images.fr2188, true);
  if (category === "big jeep") return result(images.fr900Wide, true);
  if (category === "small bike") return result(images.avenger, true);
  if (category === "medium bike") return result(images.champBike, true);
  if (category === "scooter") return result(images.peppy, true);
  if (category === "car") return result(images.smileyCar, true);

  return result("/Tycoon_Logo.JPG", true);
}

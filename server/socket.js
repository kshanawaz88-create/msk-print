const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const PrintJob = require("./models/printJob");
const Shop = require("./models/Shop");
const User = require("./models/User");

let io = null;

const normalizeShopCode = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
};

const isValidShopCode = (value) =>
  /^[A-Z0-9-]{3,50}$/.test(value);

const isValidPublicToken = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{64}$/i.test(value);

const hashPublicToken = (token) =>
  crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

const publicOrderRoom = (jobId) =>
  `public-order:${jobId}`;

const shopRoom = (shopId) =>
  `shop:${shopId}`;

const authorizeShopRoom = async (socket, requestedShopId) => {
  const token = typeof socket.handshake.auth?.token === "string"
    ? socket.handshake.auth.token
    : "";
  if (!token) return false;
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return false;
  }
  if (
    decoded.scope !== "web" ||
    !mongoose.isValidObjectId(decoded.id || decoded.userId)
  ) {
    return false;
  }
  const user = await User.findById(decoded.id || decoded.userId)
    .select("role shopId isAvailable")
    .lean();
  if (!user || user.role === "customer") return false;
  if (user.role === "staff" && user.isAvailable === false) return false;
  if (user.role === "admin") return true;
  return user.shopId?.toString() === requestedShopId;
};

const safeOrderPayload = (order) => {
  if (!order) {
    return null;
  }

  const source =
    typeof order.toObject === "function"
      ? order.toObject()
      : { ...order };

  return {
    _id:
      source._id?.toString?.() ||
      source.id ||
      "",

    fileName: source.fileName || "",
    pages: Number(source.pages) || 1,
    copies: Number(source.copies) || 1,

    printType:
      source.printType ||
      "Black & White",

    side:
      source.side ||
      "Single Side",

    paperSize:
      source.paperSize ||
      "A4",

    price:
      Number(source.price) || 0,

    currency:
      source.currency || "INR",

    paymentMethod:
      source.paymentMethod || "",

    paymentStatus:
      source.paymentStatus || "Pending",

    status:
      source.status || "Pending",

    invoiceNumber:
      source.paymentStatus === "Paid"
        ? source.invoiceNumber || ""
        : "",

    errorReason:
      source.status === "Error"
        ? source.errorReason || ""
        : "",

    printStartedAt:
      source.printStartedAt || null,

    printCompletedAt:
      source.printCompletedAt || null,

    createdAt:
      source.createdAt || null,

    updatedAt:
      source.updatedAt || null,
  };
};

const initializeSocket = (
  httpServer,
  allowedOrigins = []
) => {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,

      methods: [
        "GET",
        "POST",
      ],
    },
  });

  io.on("connection", (socket) => {
    /*
      Guest customer joins an order room using:

      {
        orderToken,
        shopCode
      }

      The raw order token is never used as the room name.
      The server hashes it, validates it against MongoDB,
      confirms that it belongs to the requested shop,
      and then joins a room based on the internal order ID.
    */
    socket.on(
      "join-public-order",
      async (payload = {}, acknowledge) => {
        try {
          const orderToken =
            typeof payload.orderToken ===
            "string"
              ? payload.orderToken.trim()
              : "";

          const shopCode =
            normalizeShopCode(
              payload.shopCode
            );

          if (
            !isValidPublicToken(
              orderToken
            ) ||
            !isValidShopCode(shopCode)
          ) {
            const response = {
              success: false,
              message:
                "Invalid public order details",
            };

            if (
              typeof acknowledge ===
              "function"
            ) {
              acknowledge(response);
            }

            return;
          }

          const shop =
            await Shop.findOne({
              shopCode,
              isActive: true,
            }).select("_id");

          if (!shop) {
            const response = {
              success: false,
              message:
                "Shop not found or unavailable",
            };

            if (
              typeof acknowledge ===
              "function"
            ) {
              acknowledge(response);
            }

            return;
          }

          const tokenHash =
            hashPublicToken(
              orderToken
            );

          const job =
            await PrintJob.findOne({
              shopId: shop._id,

              publicOrderTokenHash:
                tokenHash,

              publicOrderExpiresAt: {
                $gt: new Date(),
              },
            })
              .select(
                [
                  "_id",
                  "shopId",
                  "fileName",
                  "pages",
                  "copies",
                  "printType",
                  "side",
                  "paperSize",
                  "price",
                  "currency",
                  "paymentMethod",
                  "paymentStatus",
                  "status",
                  "invoiceNumber",
                  "errorReason",
                  "printStartedAt",
                  "printCompletedAt",
                  "createdAt",
                  "updatedAt",
                  "+publicOrderTokenHash",
                  "+publicOrderExpiresAt",
                ].join(" ")
              )
              .lean();

          if (!job) {
            const response = {
              success: false,
              message:
                "Public order not found or link expired",
            };

            if (
              typeof acknowledge ===
              "function"
            ) {
              acknowledge(response);
            }

            return;
          }

          const room =
            publicOrderRoom(
              job._id.toString()
            );

          await socket.join(room);

          const response = {
            success: true,
            orderId:
              job._id.toString(),
          };

          if (
            typeof acknowledge ===
            "function"
          ) {
            acknowledge(response);
          }

          socket.emit(
            "order-updated",
            safeOrderPayload(job)
          );

        } catch (error) {
          console.error(
            "Socket public-order join error:",
            error.message
          );

          if (
            typeof acknowledge ===
            "function"
          ) {
            acknowledge({
              success: false,
              message:
                "Unable to join order updates",
            });
          }
        }
      }
    );

    // Shop rooms require a current web JWT and server-side role/shop lookup.
    socket.on(
      "join-shop",
      async (
        payload = {},
        acknowledge
      ) => {
        const shopId =
          typeof payload.shopId ===
          "string"
            ? payload.shopId.trim()
            : "";

        if (
          !mongoose.isValidObjectId(
            shopId
          )
        ) {
          if (
            typeof acknowledge ===
            "function"
          ) {
            acknowledge({
              success: false,
              message:
                "Invalid shop ID",
            });
          }

          return;
        }

        if (!(await authorizeShopRoom(socket, shopId))) {
          if (typeof acknowledge === "function") {
            acknowledge({ success: false, message: "Shop socket access denied" });
          }
          return;
        }

        await socket.join(shopRoom(shopId));

        if (
          typeof acknowledge ===
          "function"
        ) {
          acknowledge({
            success: true,
          });
        }
      }
    );

  });

  return io;
};

const getSocket = () => {
  if (!io) {
    throw new Error(
      "Socket.IO has not been initialized"
    );
  }

  return io;
};

const closeSocket = async () => {
  if (!io) return;
  const active = io;
  io = null;
  await new Promise((resolve) => active.close(resolve));
};

/*
  Use this after a PrintJob has been saved.

  Example:

  emitOrderUpdate({
    orderToken: job._id.toString(),
    shopId: job.shopId?.toString(),
    order: safeOrderPayload(job),
  });
*/
const emitOrderUpdate = ({
  orderToken,
  shopId,
  order,
}) => {
  if (!io) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("Socket.IO is not initialized");
    }
    return;
  }

  const payload = safeOrderPayload(order);
  if (!payload?._id) return;

  if (orderToken) {
    const room = `public-order:${orderToken}`;

    io.to(room).emit(
      "order-updated",
      payload
    );
  }

  if (shopId) {
    const shopRoom = `shop:${shopId}`;

    io.to(shopRoom).emit(
      "shop-order-updated",
      payload
    );
  }
};

module.exports = {
  initializeSocket,
  getSocket,
  closeSocket,
  emitOrderUpdate,
  safeOrderPayload,
};

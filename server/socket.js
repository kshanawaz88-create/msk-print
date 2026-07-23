const crypto = require("crypto");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const PrintJob = require("./models/printJob");
const Shop = require("./models/Shop");

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
    console.log(
      "🔌 Socket connected:",
      socket.id
    );

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

          console.log(
            "✅ Guest joined order room:",
            job._id.toString()
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

    /*
      This shop room handler should only be used after
      authenticated shop socket access is added.

      For now it validates only the MongoDB ID and should
      not be used for sensitive shop data.
    */
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

        await socket.join(
          shopRoom(shopId)
        );

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

    socket.on("disconnect", () => {
      console.log(
        "🔌 Socket disconnected:",
        socket.id
      );
    });
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
    console.log("⚠️ Socket.IO is not initialized");
    return;
  }

  if (orderToken) {
    const room = `public-order:${orderToken}`;

    console.log(
      "📡 Emitting customer order update:",
      room
    );

    io.to(room).emit(
      "order-updated",
      order
    );
  }

  if (shopId) {
    const shopRoom = `shop:${shopId}`;

    console.log(
      "📡 Emitting shop order update:",
      shopRoom
    );

    io.to(shopRoom).emit(
      "shop-order-updated",
      order
    );
  }
};

module.exports = {
  initializeSocket,
  getSocket,
  emitOrderUpdate,
  safeOrderPayload,
};
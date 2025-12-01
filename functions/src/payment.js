const functions = require("firebase-functions");
const cors = require("cors")({ origin: true });
const { MercadoPagoConfig, Preference } = require("mercadopago");

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const preference = new Preference(client);

// ---------------------------
// Crear preferencia de pago
// ---------------------------
exports.createPreference = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { id, title, unit_price } = req.body;

      const body = {
        items: [
          {
            id: id || "default-service",
            title: title || "Trabajo de Tiveo",
            quantity: 1,
            unit_price: Number(unit_price || 0),
          },
        ],
        back_urls: {
          success: "https://www.google.com", // 👉 reemplazar por tu URL real
          failure: "https://www.google.com",
          pending: "https://www.google.com",
        },
        auto_return: "approved",
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }],
        },
      };

      const result = await preference.create({ body });

      res.json({
        preferenceId: result.id,
        init_point: result.init_point, // 👈 esta URL abre tu app
      });
    } catch (error) {
      console.error("❌ Error creando preferencia:", error);
      res.status(500).json({ error: error.message, details: error });
    }
  });
});

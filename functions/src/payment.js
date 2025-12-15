const functions = require("firebase-functions");
const cors = require("cors")({ origin: true });
const admin = require("firebase-admin");
const {
  MercadoPagoConfig,
  Preference,
  Payment: PaymentClient,
} = require("mercadopago");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

const preference = new Preference(client);
const paymentClient = new PaymentClient(client);

// ---------------------------
// Crear preferencia de pago
// ---------------------------
exports.createPreference = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { id, title, unit_price } = req.body;
      const notificationUrl = `https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/paymentWebhook`;

      const body = {
        items: [
          {
            id: id || "default-service",
            title: title || "Trabajo de Tiveo",
            quantity: 1,
            unit_price: Number(unit_price || 0),
          },
        ],
        external_reference: id,
        notification_url: notificationUrl,
        back_urls: {
          success: "tiveo://payment/success",
          failure: "tiveo://payment/failure",
          pending: "tiveo://payment/pending",
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

// ---------------------------
// Webhook de Mercado Pago
// ---------------------------
exports.paymentWebhook = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const paymentId =
        req.body?.data?.id ||
        req.query?.data_id ||
        req.query?.id ||
        req.body?.id;

      if (!paymentId) {
        console.warn("⚠️ Webhook sin paymentId", {
          body: req.body,
          query: req.query,
        });
        return res.status(400).json({ error: "Missing payment id" });
      }

      // Traemos info del pago desde MP
      const mpPayment = await paymentClient.get({ id: paymentId });
      const paymentData = mpPayment?.body || mpPayment;
      const externalReference =
        paymentData?.external_reference || paymentData?.externalReference;
      const status = (paymentData?.status || "").toLowerCase();

      const statusMap = {
        approved: "paid",
        pending: "pending",
        in_process: "pending",
        rejected: "pending",
        cancelled: "pending",
        refunded: "pending",
      };

      const appStatus = statusMap[status] || "pending";

      const paymentDocId = externalReference || paymentId;
      const paymentRef = db.collection("payments").doc(paymentDocId);
      const paymentSnap = await paymentRef.get();

      if (!paymentSnap.exists) {
        console.warn("⚠️ No se encontró documento de pago", {
          paymentDocId,
          paymentId,
        });
      } else {
        const paymentDoc = paymentSnap.data();
        await paymentRef.update({
          status: appStatus,
          mpStatus: status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          transactionId: paymentData?.id?.toString?.() || paymentId.toString(),
        });

        if (paymentDoc?.activityId) {
          await db.collection("activities").doc(paymentDoc.activityId).update({
            paymentStatus: appStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        if (paymentDoc?.workerId) {
          const workerUpdate = {
            paymentStatus: appStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          if (appStatus === "paid" && paymentDoc.status !== "paid") {
            workerUpdate.completedJobs = admin.firestore.FieldValue.increment(1);
          }

          await db
            .collection("workers")
            .doc(paymentDoc.workerId)
            .set(workerUpdate, { merge: true });
        }
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("❌ Error en webhook de pago:", error);
      return res.status(500).json({ error: error.message });
    }
  });
});

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-change-me";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@crm.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";

const noteSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true },
    followUpDate: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    source: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["new", "contacted", "converted"],
      default: "new",
    },
    notes: { type: [noteSchema], default: [] },
  },
  { timestamps: true }
);

const adminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

const Lead = mongoose.model("Lead", leadSchema);
const Admin = mongoose.model("Admin", adminSchema);

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const ensureDefaultAdmin = async () => {
  const existing = await Admin.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existing) {
    return;
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await Admin.create({
    email: ADMIN_EMAIL.toLowerCase(),
    password: hashedPassword,
  });

  console.log(`Default admin created: ${ADMIN_EMAIL}`);
};

app.get("/", (req, res) => {
  res.json({ message: "Mini CRM backend is running" });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const matches = await bcrypt.compare(password, admin.password);
    if (!matches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: admin._id, email: admin.email }, JWT_SECRET, {
      expiresIn: "12h",
    });

    return res.json({ token, admin: { email: admin.email } });
  } catch (error) {
    return res.status(500).json({ message: "Login failed", error: error.message });
  }
});

app.get("/api/leads", authenticate, async (req, res) => {
  try {
    const { search = "", status = "", source = "" } = req.query;
    const query = {};

    if (search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
      ];
    }

    if (status && ["new", "contacted", "converted"].includes(status)) {
      query.status = status;
    }

    if (source.trim()) {
      query.source = { $regex: `^${source.trim()}$`, $options: "i" };
    }

    const leads = await Lead.find(query).sort({ createdAt: -1 });
    return res.json(leads);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch leads", error: error.message });
  }
});

app.post("/api/leads", authenticate, async (req, res) => {
  try {
    const { name, email, source, status } = req.body;
    if (!name || !email || !source) {
      return res.status(400).json({ message: "Name, email and source are required" });
    }

    const lead = await Lead.create({
      name,
      email,
      source,
      status: status || "new",
    });
    return res.status(201).json(lead);
  } catch (error) {
    return res.status(500).json({ message: "Failed to create lead", error: error.message });
  }
});

app.patch("/api/leads/:id/status", authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["new", "contacted", "converted"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    return res.json(lead);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update status", error: error.message });
  }
});

app.put("/api/leads/:id", authenticate, async (req, res) => {
  try {
    const { name, email, source, status } = req.body;
    if (!name || !email || !source || !status) {
      return res.status(400).json({
        message: "Name, email, source and status are required",
      });
    }
    if (!["new", "contacted", "converted"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { name, email, source, status },
      { new: true, runValidators: true }
    );
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    return res.json(lead);
  } catch (error) {
    return res.status(500).json({ message: "Failed to update lead", error: error.message });
  }
});

app.delete("/api/leads/:id", authenticate, async (req, res) => {
  try {
    const deletedLead = await Lead.findByIdAndDelete(req.params.id);
    if (!deletedLead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    return res.json({ message: "Lead deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete lead", error: error.message });
  }
});

app.post("/api/leads/:id/notes", authenticate, async (req, res) => {
  try {
    const { content, followUpDate } = req.body;
    if (!content) {
      return res.status(400).json({ message: "Note content is required" });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    lead.notes.unshift({
      content,
      followUpDate: followUpDate || null,
    });

    await lead.save();
    return res.status(201).json(lead);
  } catch (error) {
    return res.status(500).json({ message: "Failed to add note", error: error.message });
  }
});

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mini_crm")
  .then(async () => {
    console.log("Connected to MongoDB");
    await ensureDefaultAdmin();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });

import cors from "cors";
import express from "express";
import morgan from "morgan";
import { config } from "./config.js";
import { errorHandler } from "./middleware/error-handler.js";
import authRoutes from "./routes/auth.routes.js";
import transactionRoutes from "./routes/transaction.routes.js";
import userRoutes from "./routes/user.routes.js";

export const app = express();

app.use(
  cors({
    origin: config.clientUrl
  })
);
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/accounts", userRoutes);
app.use("/api/transactions", transactionRoutes);
app.use(errorHandler);

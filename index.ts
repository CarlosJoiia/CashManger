import "reflect-metadata";
import express, { Request, Response, NextFunction } from 'express';
import cors from "cors";
import * as FinanceController from "./src/controller/FinanceController";
import * as addFinanceController from "./src/controller/addFinanceController";
import * as AuthController from "./src/controller/AuthController";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PORT = process.env.PORT || 1403;

async function startup() {
  const app = express();

  app.use(express.json());
  app.use(cors());

  // Rotas de autenticação
  app.post("/auth/register", AuthController.register);
  app.post("/auth/login", AuthController.login);
  app.get("/validaremail", AuthController.validateEmail);

  // Rotas para operações financeiras
  app.post("/adicionarFinanceiro", addFinanceController.addFinanceData);
  app.post("/BuscarParcelas", FinanceController.getParcelasByDespesaId);
  app.post("/ResumoDoMes", FinanceController.getMonthlyFinanceData);
  app.post("/RelatoriosAnos", FinanceController.getTransactionYears);
  app.post("/RelatorioMensal", FinanceController.getMonthlySummary);
  app.post("/PagarParcela", FinanceController.Installment);

  // Middleware para tratar erros
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: "Erro interno do servidor." });
  });

  app.listen(PORT, () => {
    console.log("App running on port " + PORT);
  });
}

startup().catch((error) => {
  console.error("Erro ao iniciar o servidor:", error);
});

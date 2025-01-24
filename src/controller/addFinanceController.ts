import { PrismaClient, Parcela } from "@prisma/client";
import { Request, Response } from "express";
import { parse, addMonths } from "date-fns";


const prisma = new PrismaClient();

export async function addFinanceData(request: Request, response: Response) {
  const {
    userId,
    category,
    value,
    description,
    paymentType,
    date,
    creditCardDetails,
  } = request.body;

  if (!userId || !category || !value || !date || !paymentType) {
    return response
      .status(400)
      .json({ mensagem: "Campos obrigatórios faltando." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return response.status(404).json({ mensagem: "Usuário não encontrado." });
    }

    let existingCategory = await prisma.categoria.findFirst({
      where: { name: category, userId: userId },
    });

    if (!existingCategory) {
      existingCategory = await prisma.categoria.create({
        data: { name: category, type: "DESPESA", userId: userId },
      });
    }

    if (paymentType === "CREDITO") {
      const installments = creditCardDetails?.installments || 1;
      const installmentValue = creditCardDetails?.installmentValue || value;

      if (installments < 1 || installmentValue <= 0) {
        return response
          .status(400)
          .json({ mensagem: "Detalhes do parcelamento inválidos." });
      }

      const mainExpense = await prisma.despesa.create({
        data: {
          userId: userId,
          date: new Date(date),
          value: parseFloat(value),
          category: existingCategory.name,
          paymentType: "CREDITO",
          transactionType: installments > 1 ? "PARCELADO" : "À Vista",
          description: `${description ? description + " - " : ""}Compra ${
            installments > 1 ? `parcelada em ${installments}x` : "à vista"
          } no crédito`,
        },
      });

      for (let i = 1; i <= installments; i++) {
        const dueDate = addMonths(new Date(date), i); // Primeira parcela no mês seguinte, e incrementa subsequentes

        await prisma.parcela.create({
          data: {
            despesaId: mainExpense.id,
            parcelaNumber: i,
            value: parseFloat(installmentValue),
            dueDate: dueDate,
            status: "PENDENTE",
          },
        });
      }

      return response.status(201).json({
        mensagem: `Despesa ${
          installments > 1 ? "parcelada" : "à vista"
        } registrada com sucesso.`,
        mainExpense,
      });
    }

    const expense = await prisma.despesa.create({
      data: {
        userId: userId,
        date: new Date(date),
        value: parseFloat(value),
        category: existingCategory.name,
        paymentType: paymentType,
        transactionType: "À Vista",
        description: description || null,
      },
    });

    return response.status(201).json({
      mensagem: "Despesa registrada com sucesso.",
      expense,
    });
  } catch (error) {
    console.error("Erro ao adicionar dados financeiros:", error);
    return response
      .status(500)
      .json({ mensagem: "Erro ao adicionar dados financeiros." });
  }
}
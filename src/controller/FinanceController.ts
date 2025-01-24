import { PrismaClient, Parcela } from "@prisma/client";
import { Request, Response } from "express";
import { parse, addMonths } from "date-fns"; // Usando 'parse' na versão 4.x

const prisma = new PrismaClient();

// Importa as funções para requisições e respostas HTTP




export async function getParcelasByDespesaId(
  request: Request,
  response: Response
) {
  const { Id } = request.body; // Desestrutura o valor de "Id" do corpo
  console.log(Id);

  try {
    // Verifica se o Id foi passado e se é um número válido
    if (!Id || isNaN(Number(Id))) {
      return response.status(400).json({ mensagem: "ID da despesa inválido." });
    }

    // Converte o Id para número
    const IdNumber = Number(Id);

    // Busca a despesa e as parcelas associadas
    const despesa = await prisma.despesa.findUnique({
      where: { id: IdNumber },
      include: {
        Parcelas: true, // Inclui as parcelas relacionadas
      },
    });

    // Verifica se a despesa existe
    if (!despesa) {
      return response.status(404).json({ mensagem: "Despesa não encontrada." });
    }

    // Verifica se a despesa tem parcelas associadas
    if (!despesa.Parcelas || despesa.Parcelas.length === 0) {
      return response
        .status(404)
        .json({ mensagem: "Nenhuma parcela encontrada para esta despesa." });
    }

    // Calcula o total da despesa (valor da despesa original)
    const totalCompra = despesa.value.toNumber(); // Converte Decimal para número

    // Calcula a soma das parcelas com status "PENDENTE"
    const somaParcelasPendentes = despesa.Parcelas.reduce((total, parcela) => {
      if (parcela.status === "PENDENTE") {
        return total + parseFloat(parcela.value.toString()); // Converte Decimal para string e depois para número
      }
      return total;
    }, 0);

    // Retorna os dados, incluindo o total da compra, soma das parcelas pendentes e a data de criação da despesa (agora usando "date")
    return response.status(200).json({
      despesaId: despesa.id,
      category: despesa.category,
      paymentType: despesa.paymentType,
      totalCompra: totalCompra.toFixed(2), // Valor total da compra
      somaParcelasPendentes: somaParcelasPendentes.toFixed(2), // Soma das parcelas pendentes
      Parcelas: despesa.Parcelas,
      date: despesa.date.toISOString(), // Data da despesa, agora usando o campo "date"
    });
  } catch (error) {
    console.error("Erro ao buscar parcelas da despesa:", error);
    return response
      .status(500)
      .json({ mensagem: "Erro ao buscar parcelas da despesa." });
  }
}



export async function getMonthlyFinanceData(
  request: Request,
  response: Response
) {
  const { userId, month, year } = request.body;

  try {
    // Validações iniciais
    if (!userId || isNaN(userId)) {
      return response.status(400).json({ mensagem: "userId inválido." });
    }
    if (
      !month ||
      !year ||
      isNaN(month) ||
      isNaN(year) ||
      month < 1 ||
      month > 12
    ) {
      return response.status(400).json({ mensagem: "Mês ou ano inválidos." });
    }

    // Verifica se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return response.status(404).json({ mensagem: "Usuário não encontrado." });
    }

    // Define o intervalo de datas para o mês solicitado
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Último dia do mês

    // Consulta as receitas do mês
    const receitas = await prisma.receita.findMany({
      where: {
        userId: userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Consulta as despesas do mês, incluindo as parcelas e também as parcelas pagas antecipadamente
    const despesas = await prisma.despesa.findMany({
      where: {
        userId: userId,
        OR: [
          {
            date: {
              gte: startDate,
              lte: endDate,
            },
          },
          {
            Parcelas: {
              some: {
                OR: [
                  {
                    dueDate: {
                      gte: startDate,
                      lte: endDate,
                    },
                  },
                  {
                    AND: [
                      {
                        status: "PAGOANTECIPADO",
                        paymentDate: {
                          gte: startDate,
                          lte: endDate,
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
      include: {
        Parcelas: true,
      },
    });

    // Calcula os totais de receitas e despesas
    const totalReceitas = receitas.reduce(
      (total, receita) => total + receita.value.toNumber(),
      0
    );

    // Preparar o total de despesas, considerando parcelas antecipadas
    const totalDespesas = despesas.reduce((total, despesa) => {
      if (despesa.paymentType !== "CREDITO") {
        return total + despesa.value.toNumber();
      }

      // Para despesas com crédito, verifica as parcelas
      const parcelasNoMes = despesa.Parcelas.filter((parcela) => {
        if (parcela.status === "PAGOANTECIPADO") {
          // Se foi paga antecipadamente, verifica se foi paga no mês atual
          return (
            parcela.paymentDate &&
            parcela.paymentDate >= startDate &&
            parcela.paymentDate <= endDate
          );
        } else {
          // Para outras parcelas, verifica o vencimento
          return parcela.dueDate >= startDate && parcela.dueDate <= endDate;
        }
      });

      const totalParcelasNoMes = parcelasNoMes.reduce(
        (parcelSum: number, parcela) => parcelSum + parcela.value.toNumber(),
        0
      );

      return total + totalParcelasNoMes;
    }, 0);

    // Calcula o total de crédito pago no mês (incluindo antecipados)
    const totalCreditoPago = despesas.reduce((total, despesa) => {
      if (despesa.paymentType === "CREDITO") {
        const parcelasPagasNoMes = despesa.Parcelas.filter(
          (parcela) =>
            (parcela.status === "PAGO" &&
              parcela.dueDate >= startDate &&
              parcela.dueDate <= endDate) ||
            (parcela.status === "PAGOANTECIPADO" &&
              parcela.paymentDate &&
              parcela.paymentDate >= startDate &&
              parcela.paymentDate <= endDate)
        );

        const totalPagas = parcelasPagasNoMes.reduce(
          (parcelSum, parcela) => parcelSum + parcela.value.toNumber(),
          0
        );

        return total + totalPagas;
      }
      return total;
    }, 0);

    // Calcula os totais de Pix, Débito e Dinheiro
    let totalPix = 0;
    let totalDebito = 0;
    let totalDinheiro = 0;

    despesas.forEach((despesa) => {
      if (despesa.paymentType === "PIX") {
        totalPix += despesa.value.toNumber();
      } else if (despesa.paymentType === "DEBITO") {
        totalDebito += despesa.value.toNumber();
      } else if (despesa.paymentType === "DINHEIRO") {
        totalDinheiro += despesa.value.toNumber();
      }
    });

    // Prepara o array principal de despesas com detalhes das parcelas
    const despesasComParcelasDetalhadas = despesas.map((despesa) => {
      const parcelasDetalhadas = despesa.Parcelas.map((parcela) => ({
        parcelaNumber: parcela.parcelaNumber,
        dueDate: parcela.dueDate,
        paymentDate: parcela.paymentDate,
        status: parcela.status,
        value: parcela.value.toNumber(),
        antecipadaDesteMes:
          parcela.status === "PAGOANTECIPADO" &&
          parcela.paymentDate &&
          parcela.paymentDate >= startDate &&
          parcela.paymentDate <= endDate,
        venceNesteMes:
          parcela.dueDate >= startDate && parcela.dueDate <= endDate,
      }));

      // Verifica se todas as parcelas estão pagas (PAGO ou PAGOANTECIPADO)
      const todasParcelasPagas =
        despesa.Parcelas.length > 0 &&
        despesa.Parcelas.every(
          (parcela) =>
            parcela.status === "PAGO" || parcela.status === "PAGOANTECIPADO"
        );

      return {
        id: despesa.id,
        userId: despesa.userId,
        date: despesa.date,
        value: despesa.value.toNumber(),
        category: despesa.category,
        paymentType: despesa.paymentType,
        description: despesa.description,
        createdAt: despesa.createdAt,
        parcelas: parcelasDetalhadas,
        totalParcelas:
          despesa.Parcelas.length > 0 ? despesa.Parcelas.length : 1,
        compraPaga: todasParcelasPagas,
      };
    });

    // Resumo de despesas com cartão de crédito
    const despesasCreditoNoMes = despesasComParcelasDetalhadas.filter(
      (despesa) =>
        despesa.paymentType === "CREDITO" &&
        despesa.date >= startDate &&
        despesa.date <= endDate
    );

    const despesasCreditoResumo = despesasCreditoNoMes.map((despesa) => ({
      id: despesa.id,
      value: despesa.value,
      totalParcelas: despesa.totalParcelas,
      compraPaga: despesa.compraPaga,
    }));

    // Calcula o total de crédito usado no mês
    const totalCreditoUsado = despesasCreditoNoMes.reduce(
      (sum, despesa) => sum + despesa.value,
      0
    );

    // Calcula o crédito a ser pago: soma das parcelas pendentes que vencem no mês
    const totalCreditoAPagar = despesas.reduce((total, despesa) => {
      if (despesa.paymentType === "CREDITO") {
        const parcelasPendentes = despesa.Parcelas.filter(
          (parcela) =>
            parcela.dueDate >= startDate &&
            parcela.dueDate <= endDate &&
            parcela.status === "PENDENTE"
        );

        return (
          total +
          parcelasPendentes.reduce(
            (parcelSum, parcela) => parcelSum + parcela.value.toNumber(),
            0
          )
        );
      }
      return total;
    }, 0);

    // Formata a resposta
    const responseData = {
      totalReceitas,
      totalDespesas,
      saldo: totalReceitas - totalDespesas,
      totalCreditoUsado,
      totalCreditoAPagar,
      totalCreditoPago,
      despesasCreditoResumo,
      totalPix,
      totalDebito,
      totalDinheiro,
      receitas,
      despesas: despesasComParcelasDetalhadas,
    };

    return response.status(200).json(responseData);
  } catch (error) {
    console.error("Erro ao buscar dados financeiros do mês:", error);
    return response
      .status(500)
      .json({ mensagem: "Erro ao buscar dados financeiros do mês." });
  }
}

export async function getMonthlySummary(request: Request, response: Response) {
  const { userId, year } = request.body;

  try {
    if (!userId || isNaN(userId)) {
      return response.status(400).json({ mensagem: "userId inválido." });
    }

    if (!year || isNaN(year)) {
      return response.status(400).json({ mensagem: "Ano inválido." });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return response.status(404).json({ mensagem: "Usuário não encontrado." });
    }

    // Busca todas as receitas do ano
    const receitas = await prisma.receita.groupBy({
      by: ["date"],
      where: {
        userId: userId,
        date: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31),
        },
      },
      _sum: {
        value: true,
      },
    });

    // Busca todas as despesas do ano com suas parcelas
    const despesas = await prisma.despesa.findMany({
      where: {
        userId: userId,
        OR: [
          {
            date: {
              gte: new Date(year, 0, 1),
              lte: new Date(year, 11, 31),
            },
          },
          {
            Parcelas: {
              some: {
                OR: [
                  {
                    dueDate: {
                      gte: new Date(year, 0, 1),
                      lte: new Date(year, 11, 31),
                    },
                  },
                  {
                    AND: [
                      {
                        status: "PAGOANTECIPADO",
                        paymentDate: {
                          gte: new Date(year, 0, 1),
                          lte: new Date(year, 11, 31),
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
      include: {
        Parcelas: true,
      },
    });

    const monthlySummary = Array.from({ length: 12 }, (_, index) => {
      const monthStart = new Date(year, index, 1);
      const monthEnd = new Date(year, index + 1, 0);

      // Calcula total de receitas do mês
      const receitaTotal = receitas
        .filter((r) => {
          const receitaDate = new Date(r.date);
          return receitaDate >= monthStart && receitaDate <= monthEnd;
        })
        .reduce((sum: number, r: any) => sum + Number(r._sum.value || 0), 0);

      let despesaTotal = 0;

      // Processa cada despesa
      despesas.forEach((despesa) => {
        // Para despesas normais (não crédito)
        if (despesa.paymentType !== "CREDITO") {
          const despesaDate = new Date(despesa.date);
          if (despesaDate >= monthStart && despesaDate <= monthEnd) {
            despesaTotal += parseFloat(despesa.value.toString());
          }
          return;
        }

        // Para despesas de crédito com parcelas
        if (despesa.paymentType === "CREDITO" && despesa.Parcelas.length === 0) {
          const despesaDate = new Date(despesa.date);
          if (despesaDate >= monthStart && despesaDate <= monthEnd) {
            despesaTotal += parseFloat(despesa.value.toString());
          }
        } else if (despesa.paymentType === "CREDITO" && despesa.Parcelas.length > 0) {
          // Verifica as parcelas de uma despesa de crédito
          despesa.Parcelas.forEach((parcela) => {
            const parcelaValue = parseFloat(parcela.value.toString());

            if (parcela.status === "PAGOANTECIPADO" && parcela.paymentDate) {
              // Se a parcela foi paga antecipadamente, conta no mês do pagamento
              const paymentDate = new Date(parcela.paymentDate);
              if (paymentDate >= monthStart && paymentDate <= monthEnd) {
                despesaTotal += parcelaValue;
              }
            } else if (parcela.status === "PAGO" || parcela.status === "PENDENTE") {
              // Se a parcela foi paga ou está pendente e vence no mês, conta
              const dueDate = new Date(parcela.dueDate);
              if (dueDate >= monthStart && dueDate <= monthEnd) {
                despesaTotal += parcelaValue;
              }
            }
          });
        }
      });

      const receitaTotalFormatted = parseFloat(receitaTotal.toFixed(2)) || 0;
      const despesaTotalFormatted = parseFloat(despesaTotal.toFixed(2)) || 0;
      const saldoFormatted = receitaTotalFormatted - despesaTotalFormatted;

      // Adiciona informações do mês apenas se houver movimentação
      if (receitaTotalFormatted > 0 || despesaTotalFormatted > 0) {
        return {
          month: index + 1,
          receitaTotal: receitaTotalFormatted,
          despesaTotal: despesaTotalFormatted,
          saldo: parseFloat(saldoFormatted.toFixed(2)),
        };
      }

      return null;
    }).filter((month) => month !== null);

    return response.status(200).json(monthlySummary);
  } catch (error) {
    console.error("Erro ao buscar resumo mensal:", error);
    return response
      .status(500)
      .json({ mensagem: "Erro ao buscar resumo mensal." });
  }
}


export async function getTransactionYears(
  request: Request,
  response: Response
) {
  const { userId } = request.body;

  try {
    // Verifica se o userId foi passado e se é um número válido
    if (!userId || isNaN(userId)) {
      return response.status(400).json({ mensagem: "userId inválido." });
    }

    // Verifica se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return response.status(404).json({ mensagem: "Usuário não encontrado." });
    }

    // Busca os anos das receitas do usuário
    const receitaAnos = await prisma.receita.findMany({
      where: {
        userId: userId,
      },
      select: {
        date: true, // Pega a data da receita
      },
    });

    // Busca os anos das despesas do usuário
    const despesaAnos = await prisma.despesa.findMany({
      where: {
        userId: userId,
      },
      select: {
        date: true, // Pega a data da despesa
      },
    });

    // Extrai os anos das datas de receita e despesa
    const allAnos = [
      ...receitaAnos.map((rec) => rec.date.getFullYear()),
      ...despesaAnos.map((desp) => desp.date.getFullYear()),
    ];

    // Remove anos duplicados
    const anosUnicos = Array.from(new Set(allAnos));

    console.log("ANOS" + anosUnicos);

    return response.status(200).json({ anos: anosUnicos });
  } catch (error) {
    console.error("Erro ao buscar os anos das transações:", error);
    return response
      .status(500)
      .json({ mensagem: "Erro ao buscar os anos das transações." });
  }
}

export async function Installment(request: Request, response: Response) {
  const { userId, parcelaId } = request.body;

  try {
    // Verifica se o usuário existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return response.status(404).json({ mensagem: "Usuário não encontrado." });
    }

    // Verifica se a parcela existe
    const parcela = await prisma.parcela.findUnique({
      where: { id: parcelaId },
      include: {
        Despesa: true, // Inclui informações da despesa relacionada
      },
    });

    if (!parcela) {
      return response.status(404).json({ mensagem: "Parcela não encontrada." });
    }

    // Verifica se a despesa pertence ao usuário
    if (parcela.Despesa.userId !== userId) {
      return response.status(403).json({
        mensagem: "Esta parcela não pertence ao usuário.",
      });
    }

    // Verifica se a parcela já está paga
    if (parcela.status === "PAGO" || parcela.status === "PAGOANTECIPADO") {
      return response
        .status(400)
        .json({ mensagem: "Esta parcela já está paga." });
    }

    // Obtém a data atual para o pagamento
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    // Verifica o status de pagamento (PAGO ou PAGOANTECIPADO)
    const dueDate = new Date(parcela.dueDate); // Data de vencimento da parcela
    const status =
      currentDate.getMonth() === dueDate.getMonth() &&
      currentDate.getFullYear() === dueDate.getFullYear()
        ? "PAGO"
        : "PAGOANTECIPADO";

    // Atualiza o status da parcela e define a data de pagamento
    const updatedParcela = await prisma.parcela.update({
      where: { id: parcelaId },
      data: {
        status,
        paymentDate: currentDate,
      },
      include: {
        Despesa: {
          select: {
            category: true,
            value: true,
            description: true,
          },
        },
      },
    });

    return response.status(200).json({
      mensagem: "Parcela paga com sucesso.",
      parcela: {
        id: updatedParcela.id,
        numeroParcela: updatedParcela.parcelaNumber,
        valor: updatedParcela.value,
        dataVencimento: updatedParcela.dueDate,
        dataPagamento: updatedParcela.paymentDate,
        status: updatedParcela.status,
        categoria: updatedParcela.Despesa.category,
        descricao: updatedParcela.Despesa.description,
      },
    });
  } catch (error) {
    console.error("Erro ao pagar parcela:", error);
    return response.status(500).json({
      mensagem: "Erro ao pagar parcela.",
      erro: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
}

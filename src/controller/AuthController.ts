import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.KEYCOD;

if (!JWT_SECRET) {
  throw new Error(
    "A chave JWT_SECRET não está definida. Certifique-se de configurá-la no arquivo .env."
  );
}

// Login de usuário
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
  }

  try {
    // Busca o usuário no banco
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // Verifica o status da conta
    if (user.status !== "LIBERADO") {
      return res.status(403).json({ error: "Conta não está liberada para login." });
    }

    // Verifica a senha
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    // Gera um token JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "1h",
    });

    // Retorna o token e o id da conta
    res.json({ message: "Login bem-sucedido!", token, accountId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao realizar login." });
  }
};


/* Cadastro de usuário
export const register = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  try {
    // Verifica se o e-mail já existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'E-mail já está em uso.' });
    }

    // Cria o hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Salva o usuário no banco
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });

    res.status(201).json({ message: 'Usuário cadastrado com sucesso!', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao cadastrar o usuário.' });
  }
};

*/

export const register = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios." });
  }

  try {
    // Verifica se o e-mail já existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "E-mail já está em uso." });
    }

    // Cria o hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Salva o usuário no banco com o status "VERIFICACAOPENDENTE"
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        status: "VERIFICACAOPENDENTE", // Adiciona o status como VERIFICACAOPENDENTE
      },
    });

    // Geração do token para validação
    const token = jwt.sign(
      { email: user.email },
      process.env.KEYCOD as string,
      {
        expiresIn: "1h", // Define o tempo de expiração do token
      }
    );

    // Configuração do transporte para envio de e-mail
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: false,
      service: "gmail",
      pool: true,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.SENHA,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false,
      },
      debug: false,
      logger: true,
    });

    // Definição do conteúdo do e-mail
    const mailOptions = {
      from: process.env.EMAIL,
      to: process.env.EMAIL,
      replyTo: process.env.EMAIL,
      subject: "Confirmação de Cadastro",
      html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8" />
            <title>Confirmação de Cadastro</title>
            <style>
              /* Estilos inline são mais compatíveis com e-mails */
              .container {
                width: 100%;
                max-width: 600px; 
                margin: 0 auto; 
                background-color: #f0f0f5;
              }
  
              .content {
                padding: 50px;
                text-align: center;
              }
  
              .title {
                font-size: 32px;
                color: #3cb371;
                margin-bottom: 20px;
              }
  
              .sub-title {
                font-size: 18px;
                margin-bottom: 20px;
              }
  
              .button {
                display: block; 
                background-color: #3cb371;
                color: #ffffff;
                padding: 15px 30px;
                text-decoration: none; 
                border-radius: 5px;
                font-size: 20px;
                margin: 0 auto; 
                text-decoration: underline;
              }

                .button2 {
                display: block; 
                background-color: #FF0000;
                color: #ffffff;
                padding: 15px 30px;
                text-decoration: none; 
                border-radius: 5px;
                font-size: 20px;
                margin: 0 auto; 
                text-decoration: underline;
              }
  
              .button:hover {
                opacity: 0.9;
              }
            </style>
          </head>
          <body>
            <table class="container" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <div class="content">
                    <h1 class="title">Confirmação de Cadastro</h1>
                    <p class="sub-title">Email: ${user.email} </p>
                    <p class="sub-title">Olá,</p>
                    <p class="sub-title">Para ativar sua conta e começar a utilizar nossa plataforma, por favor, confirme seu endereço de email clicando no botão abaixo:</p>
                    <a href="${process.env.URL_SITE}/validaremail?option=${user.id}&token=${token}&action=accept" class="button">Ativar Conta</a>
                    <a href="${process.env.URL_SITE}/validaremail?option=${user.id}&token=${token}&action=reject" class="button2">Recusar Conta</a>
                    <p class="sub-title">Se você não solicitou essa confirmação, ignore este email.</p>
                    <p class="sub-title">Obrigado!</p>
                  </div>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
    };

    // Envia o e-mail
    await transporter.sendMail(mailOptions);

    // Retorna uma resposta informando que o cadastro foi realizado com sucesso
    res.status(201).json({
      message:
        "Usuário cadastrado com sucesso! Verifique seu e-mail para validar a conta.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao cadastrar o usuário." });
  }
};

export const validateEmail = async (req: Request, res: Response) => {
  const { option, token, action } = req.query;

  if (!option || !token || !action) {
    return res.status(400).json({ error: "Link inválido ou incompleto." });
  }

  try {
    // Verifica o token
    jwt.verify(token as string, process.env.KEYCOD as string);

    if (action === "accept") {
      // Atualiza o status do usuário para LIBERADO
      await prisma.user.update({
        where: { id: Number(option) },
        data: { status: "LIBERADO" },
      });
      return res.status(200).json({ message: "Conta ativada com sucesso!" });
    } else if (action === "reject") {
      // Atualiza o status do usuário para RECUSADO
      await prisma.user.update({
        where: { id: Number(option) },
        data: { status: "RECUSADO" },
      });
      return res.status(200).json({ message: "Conta recusada com sucesso." });
    } else {
      return res.status(400).json({ error: "Ação inválida." });
    }
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Token inválido ou expirado." });
  }
};

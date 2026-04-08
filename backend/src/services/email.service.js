import nodemailer from 'nodemailer';
import prisma from '../config/prisma.js';

// ── Empresa / remetente ───────────────────────────────────────────────────────
const EMPRESA = process.env.SMTP_FROM_NAME || 'MeliUnlocker';
const COR_PRIMARIA = '#7c3aed';
const COR_SECUNDARIA = '#5b21b6';

// ── Templates padrão ─────────────────────────────────────────────────────────
const TEMPLATES_PADRAO = {
  'welcome': {
    nome: 'Boas-vindas',
    assunto: `Bem-vindo ao ${EMPRESA}! Sua conta foi criada`,
    corpo: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bem-vindo</title></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${COR_PRIMARIA} 0%,${COR_SECUNDARIA} 100%);padding:40px 48px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 24px;margin-bottom:20px;">
              <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">${EMPRESA}</span>
            </div>
            <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;line-height:1.3;">Sua conta foi criada!</h1>
            <p style="color:rgba(255,255,255,0.85);margin:12px 0 0;font-size:15px;">Estamos felizes em ter você conosco</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:48px;">
            <p style="color:#1e1b4b;font-size:16px;margin:0 0 16px;">Olá, <strong>{{nome}}</strong>!</p>
            <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
              Bem-vindo ao <strong>${EMPRESA}</strong>. Sua conta foi criada com sucesso e está pronta para uso.
            </p>
            <div style="background:#f5f3ff;border-left:4px solid ${COR_PRIMARIA};border-radius:0 8px 8px 0;padding:16px 20px;margin:0 0 32px;">
              <p style="color:#4b5563;font-size:14px;margin:0;line-height:1.6;">
                <strong>Seu e-mail de acesso:</strong> {{email}}
              </p>
            </div>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <a href="{{link}}" style="display:inline-block;background:linear-gradient(135deg,${COR_PRIMARIA},${COR_SECUNDARIA});color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
                    Acessar minha conta →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 48px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
              Este e-mail foi enviado por <strong>${EMPRESA}</strong>. Se você não criou esta conta, ignore este e-mail.<br>
              © {{ano}} ${EMPRESA}. Todos os direitos reservados.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },

  'reset-password': {
    nome: 'Redefinição de senha',
    assunto: `${EMPRESA} — Solicitação de redefinição de senha`,
    corpo: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redefinir senha</title></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#d97706 0%,#b45309 100%);padding:40px 48px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 24px;margin-bottom:20px;">
              <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">${EMPRESA}</span>
            </div>
            <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:56px;height:56px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:26px;">🔐</div>
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">Redefinição de senha</h1>
            <p style="color:rgba(255,255,255,0.85);margin:10px 0 0;font-size:14px;">Recebemos uma solicitação para redefinir sua senha</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:48px;">
            <p style="color:#1e1b4b;font-size:16px;margin:0 0 16px;">Olá, <strong>{{nome}}</strong>!</p>
            <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
              Recebemos uma solicitação para redefinir a senha da conta associada a <strong>{{email}}</strong>.
              Clique no botão abaixo para criar uma nova senha.
            </p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin:0 0 28px;">
              <p style="color:#92400e;font-size:13px;margin:0;line-height:1.6;">
                ⏱ Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail — sua senha não será alterada.
              </p>
            </div>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <a href="{{link}}" style="display:inline-block;background:linear-gradient(135deg,#d97706,#b45309);color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:700;">
                    Redefinir minha senha →
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;margin:28px 0 0;text-align:center;line-height:1.6;">
              Ou copie e cole o link no navegador:<br>
              <span style="color:#6b7280;word-break:break-all;">{{link}}</span>
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 48px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
              © {{ano}} ${EMPRESA}. Todos os direitos reservados.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },

  'ticket-resposta': {
    nome: 'Resposta ao chamado',
    assunto: `${EMPRESA} — Seu chamado #{{numero}} recebeu uma resposta`,
    corpo: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resposta ao chamado</title></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${COR_PRIMARIA} 0%,${COR_SECUNDARIA} 100%);padding:36px 48px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 24px;margin-bottom:20px;">
              <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">${EMPRESA}</span>
            </div>
            <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:52px;height:52px;margin:0 auto 14px;line-height:52px;font-size:22px;">💬</div>
            <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;line-height:1.3;">Nova resposta no seu chamado</h1>
            <div style="display:inline-block;background:rgba(255,255,255,0.25);border-radius:20px;padding:5px 18px;margin-top:12px;">
              <span style="color:#fff;font-size:13px;font-weight:700;letter-spacing:1px;">TICKET #{{numero}}</span>
            </div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:40px 48px;">
            <p style="color:#1e1b4b;font-size:16px;margin:0 0 8px;">Olá, <strong>{{nome}}</strong>!</p>
            <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
              Nossa equipe de suporte respondeu ao seu chamado. Veja o que foi dito:
            </p>

            <!-- Título do chamado -->
            <div style="background:#f5f3ff;border-radius:8px;padding:12px 18px;margin:0 0 20px;">
              <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Chamado</div>
              <div style="font-size:14px;color:#1e1b4b;font-weight:600;">{{titulo}}</div>
            </div>

            <!-- Mensagem do suporte -->
            <div style="background:#f9fafb;border-left:4px solid ${COR_PRIMARIA};border-radius:0 8px 8px 0;padding:18px 20px;margin:0 0 32px;">
              <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;">🛡️ Resposta do Suporte</div>
              <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-wrap;">{{mensagem}}</div>
            </div>

            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <a href="{{link}}" style="display:inline-block;background:linear-gradient(135deg,${COR_PRIMARIA},${COR_SECUNDARIA});color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.3px;">
                    Ver chamado completo →
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#9ca3af;font-size:12px;margin:24px 0 0;text-align:center;line-height:1.6;">
              Você também pode responder diretamente na plataforma acessando seus chamados.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 48px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
              © {{ano}} ${EMPRESA}. Todos os direitos reservados.<br>
              Este e-mail foi enviado para <strong>{{email}}</strong> porque você tem um chamado aberto.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },

  'password-changed': {
    nome: 'Senha alterada',
    assunto: `${EMPRESA} — Sua senha foi alterada`,
    corpo: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Senha alterada</title></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#059669 0%,#065f46 100%);padding:40px 48px;text-align:center;">
            <div style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:12px;padding:10px 24px;margin-bottom:20px;">
              <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">${EMPRESA}</span>
            </div>
            <div style="background:rgba(255,255,255,0.2);border-radius:50%;width:56px;height:56px;margin:0 auto 16px;font-size:26px;line-height:56px;">✅</div>
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;">Senha alterada com sucesso</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:48px;">
            <p style="color:#1e1b4b;font-size:16px;margin:0 0 16px;">Olá, <strong>{{nome}}</strong>!</p>
            <p style="color:#4b5563;font-size:15px;line-height:1.7;margin:0 0 24px;">
              A senha da sua conta <strong>{{email}}</strong> foi alterada com sucesso.
            </p>
            <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:14px 18px;margin:0 0 28px;">
              <p style="color:#065f46;font-size:13px;margin:0;line-height:1.6;">
                🔒 Se você realizou essa alteração, pode ignorar este e-mail com segurança.
              </p>
            </div>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin:0 0 32px;">
              <p style="color:#991b1b;font-size:13px;margin:0;line-height:1.6;">
                ⚠️ <strong>Não foi você?</strong> Entre em contato com nosso suporte imediatamente através da plataforma.
              </p>
            </div>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center">
                  <a href="{{link}}" style="display:inline-block;background:linear-gradient(135deg,${COR_PRIMARIA},${COR_SECUNDARIA});color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:700;">
                    Acessar minha conta →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 48px;border-top:1px solid #e5e7eb;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;line-height:1.6;">
              © {{ano}} ${EMPRESA}. Todos os direitos reservados.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  },
};

// ── Transporter ───────────────────────────────────────────────────────────────
function criarTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── Busca template (DB primeiro, depois fallback padrão) ──────────────────────
async function obterTemplate(id) {
  try {
    const dbTemplate = await prisma.emailTemplate.findUnique({ where: { id } });
    if (dbTemplate?.ativo) return { assunto: dbTemplate.assunto, corpo: dbTemplate.corpo };
  } catch {
    // fallback silencioso
  }
  const padrao = TEMPLATES_PADRAO[id];
  if (!padrao) throw new Error(`Template de email desconhecido: ${id}`);
  return { assunto: padrao.assunto, corpo: padrao.corpo };
}

// ── Substitui variáveis {{chave}} no template ─────────────────────────────────
function compilar(texto, vars) {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, chave) => vars[chave] ?? '');
}

// ── Envia email usando template do banco (com fallback) ───────────────────────
export async function enviarEmail(templateId, para, vars = {}) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn(`[email] SMTP não configurado. E-mail "${templateId}" para ${para} não enviado.`);
    return;
  }

  const { assunto, corpo } = await obterTemplate(templateId);
  const varsFinal = { ano: new Date().getFullYear(), empresa: EMPRESA, ...vars };

  const transporter = criarTransporter();
  await transporter.sendMail({
    from: `"${EMPRESA}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: para,
    subject: compilar(assunto, varsFinal),
    html: compilar(corpo, varsFinal),
  });
}

// ── Retorna todos os templates (DB + defaults para os que não existem) ─────────
export async function listarTemplates() {
  const dbTemplates = await prisma.emailTemplate.findMany();
  const dbMap = Object.fromEntries(dbTemplates.map(t => [t.id, t]));

  return Object.entries(TEMPLATES_PADRAO).map(([id, padrao]) => {
    const db = dbMap[id];
    return {
      id,
      nome: db?.nome ?? padrao.nome,
      assunto: db?.assunto ?? padrao.assunto,
      corpo: db?.corpo ?? padrao.corpo,
      ativo: db?.ativo ?? true,
      personalizado: !!db,
      variaveis: extrairVariaveis(padrao.corpo),
    };
  });
}

// ── Salva ou atualiza template no banco ────────────────────────────────────────
export async function salvarTemplate(id, dados) {
  if (!TEMPLATES_PADRAO[id]) throw new Error(`Template desconhecido: ${id}`);
  return prisma.emailTemplate.upsert({
    where: { id },
    update: { ...dados, updatedAt: new Date() },
    create: { id, nome: TEMPLATES_PADRAO[id].nome, ...dados },
  });
}

// ── Restaura template para o padrão ───────────────────────────────────────────
export async function restaurarTemplate(id) {
  await prisma.emailTemplate.deleteMany({ where: { id } });
}

// ── Extrai variáveis {{chave}} de um template ──────────────────────────────────
function extrairVariaveis(texto) {
  const matches = [...new Set([...texto.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];
  return matches;
}

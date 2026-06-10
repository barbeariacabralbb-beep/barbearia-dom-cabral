// index.js - Automação WhatsApp para Barbearia
require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrcodeLib = require('qrcode');
const Database = require('better-sqlite3');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');

// ===== CONFIGURAÇÕES =====
const CONFIG = {
    DB_PATH: path.join(__dirname, 'agenda.db'),
    STATUS_FILE: path.join(__dirname, 'whatsapp_status.json'),
    LOGS_FILE: path.join(__dirname, 'whatsapp_logs.json'),
    CONFIG_FILE: path.join(__dirname, 'whatsapp_config.json'),
    TEMPO_ANTECEDENCIA_MINUTOS: 60,
    INTERVALO_VERIFICACAO_MINUTOS: 5,
    MENSAGEM_TEMPLATE: (nome, data, hora, servico) => 
        `🤝 *Olá ${nome}!*\n\n` +
        `Seu horário na *Dom Cabral Barbershop* está se aproximando:\n\n` +
        `📅 *Data:* ${data}\n` +
        `⏰ *Hora:* ${hora}\n` +
        `💈 *Serviço:* ${servico}\n\n` +
        `Estamos te aguardando! 😊\n\n` +
        `📍 R. Ver. Túlio Putini, Bueno Brandão - MG`,
    
    MENSAGEM_LEMBRETE: (nome, data, hora, servico) =>
        `⏰ *Lembrete importante, ${nome}!*\n\n` +
        `Seu horário na Dom Cabral é *HOJE*:\n\n` +
        `⏰ *Hora:* ${hora}\n` +
        `💈 *Serviço:* ${servico}\n\n` +
        `Qualquer imprevisto, nos avise pelo WhatsApp! 📱`
};

// ===== FUNÇÃO CORRIGIDA - Formato que o main.py espera =====
function salvarStatusWhatsApp(statusTexto, qrCodeBase64 = null, qrRaw = null) {
    const dados = {
        connected: statusTexto === 'connected',
        qrCode: qrCodeBase64,
        qrRaw: qrRaw,
        ultimaAtualizacao: new Date().toISOString(),
        statusTexto: statusTexto
    };
    
    try {
        fs.writeFileSync(CONFIG.STATUS_FILE, JSON.stringify(dados, null, 2));
        console.log(`✅ Status atualizado: ${statusTexto}`);
    } catch (error) {
        console.error('❌ Erro ao salvar status:', error.message);
    }
}

// ===== FUNÇÕES AUXILIARES =====
function formatarNumeroWhatsapp(numero) {
    let numeroLimpo = numero.replace(/\D/g, '');
    if (numeroLimpo.length === 10 || numeroLimpo.length === 11) {
        numeroLimpo = '55' + numeroLimpo;
    }
    return `${numeroLimpo}@c.us`;
}

// ===== BANCO DE DADOS =====
class DatabaseManager {
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS lembretes_enviados (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agendamento_id INTEGER NOT NULL,
                tipo_mensagem TEXT NOT NULL,
                whatsapp_enviado TEXT NOT NULL,
                data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id),
                UNIQUE(agendamento_id, tipo_mensagem)
            )
        `);
        console.log('✅ Banco de dados conectado');
    }

    obterAgendamentosParaNotificar(minutosAntecedencia) {
        const query = `
            SELECT a.id, a.nome, a.whatsapp, a.data, a.hora, a.servico, a.status
            FROM agendamentos a
            WHERE a.status != 'Cancelado'
                AND a.whatsapp IS NOT NULL AND a.whatsapp != '' 
                AND a.status_pagamento = 'Pendente'
                AND datetime(a.data || ' ' || a.hora) BETWEEN datetime('now', 'localtime') 
                    AND datetime('now', 'localtime', '+${minutosAntecedencia} minutes')
                AND NOT EXISTS (
                    SELECT 1 FROM lembretes_enviados le 
                    WHERE le.agendamento_id = a.id AND le.tipo_mensagem = 'antecedencia'
                )
            ORDER BY a.data, a.hora
        `;
        return this.db.prepare(query).all();
    }

    obterAgendamentosDoDia() {
        const hoje = new Date().toISOString().split('T')[0];
        const query = `
            SELECT a.id, a.nome, a.whatsapp, a.data, a.hora, a.servico, a.status
            FROM agendamentos a
            WHERE a.data = ? AND a.status != 'Cancelado'
                AND a.whatsapp IS NOT NULL AND a.whatsapp != ''
                AND NOT EXISTS (
                    SELECT 1 FROM lembretes_enviados le 
                    WHERE le.agendamento_id = a.id AND le.tipo_mensagem = 'lembrete_dia'
                )
            ORDER BY a.hora
        `;
        return this.db.prepare(query).all(hoje);
    }

    registrarEnvio(agendamentoId, tipoMensagem, whatsapp) {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO lembretes_enviados (agendamento_id, tipo_mensagem, whatsapp_enviado)
            VALUES (?, ?, ?)
        `);
        return stmt.run(agendamentoId, tipoMensagem, whatsapp);
    }
}

// ===== CLIENTE WHATSAPP =====
class WhatsAppBot {
    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth(),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('qr', async (qr) => {
            console.log('\n📱 ESCANEIE O QR CODE ABAIXO COM O WHATSAPP:\n');
            qrcode.generate(qr, { small: true });
            
            try {
                const qrImage = await qrcodeLib.toDataURL(qr);
                // Salva no formato que o Python espera
                salvarStatusWhatsApp('qr_ready', qrImage, qr);
                console.log('✅ QR Code salvo! Acesse o painel admin para escanear.');
            } catch (error) {
                console.error('❌ Erro ao gerar QR:', error.message);
                salvarStatusWhatsApp('qr_ready', null, qr);
            }
        });

        this.client.on('loading_screen', (percent, message) => {
            console.log(`🔄 Carregando: ${percent}%`);
            salvarStatusWhatsApp('connecting');
        });

        this.client.on('authenticated', () => {
            console.log('✅ Cliente autenticado!');
            salvarStatusWhatsApp('connecting');
        });

        this.client.on('ready', () => {
            console.log('🤖 BOT WHATSAPP CONECTADO E PRONTO!');
            salvarStatusWhatsApp('connected');
        });

        this.client.on('disconnected', (reason) => {
            console.log('🔌 Desconectado:', reason);
            salvarStatusWhatsApp('disconnected');
            setTimeout(() => {
                console.log('🔄 Tentando reconectar em 30 segundos...');
                this.initialize();
            }, 30000);
        });
    }

    async initialize() {
        try {
            salvarStatusWhatsApp('connecting');
            console.log('🚀 Inicializando WhatsApp Bot...');
            await this.client.initialize();
        } catch (error) {
            console.error('❌ Erro ao inicializar:', error.message);
            setTimeout(() => this.initialize(), 60000);
        }
    }

    async enviarMensagem(numero, mensagem) {
        try {
            const num = formatarNumeroWhatsapp(numero);
            const isValid = await this.client.isRegisteredUser(num);
            if (!isValid) {
                console.log(`⚠️ Número ${numero} não registrado no WhatsApp`);
                return false;
            }
            await this.client.sendMessage(num, mensagem);
            console.log(`✅ Mensagem enviada para ${numero}`);
            return true;
        } catch (error) {
            console.error(`❌ Erro ao enviar para ${numero}:`, error.message);
            return false;
        }
    }

    isReady() {
        return this.client && this.client.pupPage !== null;
    }
}

// ===== SISTEMA DE NOTIFICAÇÕES =====
class NotificationSystem {
    constructor(dbManager, whatsappBot) {
        this.db = dbManager;
        this.bot = whatsappBot;
    }

    async processarNotificacoesAntecedencia() {
        if (!this.bot.isReady()) {
            console.log('⚠️ Bot não está pronto, pulando verificação...');
            return;
        }
        
        const agendamentos = this.db.obterAgendamentosParaNotificar(CONFIG.TEMPO_ANTECEDENCIA_MINUTOS);
        
        if (agendamentos.length === 0) return;
        
        console.log(`📋 ${agendamentos.length} agendamento(s) para notificar`);
        
        for (const agendamento of agendamentos) {
            try {
                const dataFormatada = agendamento.data.split('-').reverse().join('/');
                const mensagem = CONFIG.MENSAGEM_TEMPLATE(
                    agendamento.nome,
                    dataFormatada,
                    agendamento.hora.substring(0,5),
                    agendamento.servico
                );
                
                if (await this.bot.enviarMensagem(agendamento.whatsapp, mensagem)) {
                    this.db.registrarEnvio(agendamento.id, 'antecedencia', agendamento.whatsapp);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            } catch (error) {
                console.error(`❌ Erro ao processar:`, error.message);
            }
        }
    }

    async processarLembretesDiarios() {
        if (!this.bot.isReady()) return;
        
        const agendamentos = this.db.obterAgendamentosDoDia();
        
        if (agendamentos.length === 0) return;
        
        console.log(`📋 ${agendamentos.length} lembrete(s) para hoje`);
        
        for (const agendamento of agendamentos) {
            try {
                const agora = new Date();
                const [h, m] = agendamento.hora.split(':');
                const dataHora = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), parseInt(h), parseInt(m));
                
                if (agora < dataHora) {
                    const dataFormatada = agendamento.data.split('-').reverse().join('/');
                    const mensagem = CONFIG.MENSAGEM_LEMBRETE(
                        agendamento.nome,
                        dataFormatada,
                        agendamento.hora.substring(0,5),
                        agendamento.servico
                    );
                    
                    if (await this.bot.enviarMensagem(agendamento.whatsapp, mensagem)) {
                        this.db.registrarEnvio(agendamento.id, 'lembrete_dia', agendamento.whatsapp);
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            } catch (error) {
                console.error(`❌ Erro:`, error.message);
            }
        }
    }
}

// ===== INICIALIZAÇÃO =====
async function iniciarSistema() {
    console.log('\n🚀 INICIANDO SISTEMA WHATSAPP\n');
    console.log('=' .repeat(50));
    
    const dbManager = new DatabaseManager(CONFIG.DB_PATH);
    const whatsappBot = new WhatsAppBot();
    await whatsappBot.initialize();
    const notificationSystem = new NotificationSystem(dbManager, whatsappBot);
    
    // Verifica a cada 5 minutos
    cron.schedule(`*/5 * * * *`, () => {
        console.log(`\n🔍 Verificando agendamentos... (${new Date().toLocaleString()})`);
        notificationSystem.processarNotificacoesAntecedencia();
    });
    
    // Lembretes matinais
    cron.schedule('0 8 * * *', () => {
        console.log(`\n🌅 Enviando lembretes matinais...`);
        notificationSystem.processarLembretesDiarios();
    });
    
    // Lembretes vespertinos
    cron.schedule('0 13 * * *', () => {
        console.log(`\n🌇 Enviando lembretes vespertinos...`);
        notificationSystem.processarLembretesDiarios();
    });
    
    console.log('\n✅ SISTEMA OPERACIONAL!');
    console.log('📱 Aguardando conexão WhatsApp...\n');
    console.log('=' .repeat(50));
    
    return { whatsappBot };
}

let sistema = null;

process.on('SIGINT', async () => {
    console.log('\n🛑 Encerrando sistema...');
    if (sistema && sistema.whatsappBot) {
        await sistema.whatsappBot.client.destroy();
    }
    process.exit(0);
});

iniciarSistema().then(sys => { sistema = sys; });
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, status, Depends, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from datetime import date, time, datetime, timedelta
from typing import List, Optional
import secrets
import json
import os
#teste 
from whatsapp_bot import bot_instance

from sqlalchemy import create_engine, Column, Integer, String, Date, Time, Boolean, func, case, Float, inspect, text
from sqlalchemy.orm import sessionmaker, Session, declarative_base

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WA_LOGS_FILE = os.path.join(BASE_DIR, "whatsapp_logs.json")
WA_CONFIG_FILE = os.path.join(BASE_DIR, "whatsapp_config.json")

DB_PATH = os.getenv("DB_PATH", os.path.join(BASE_DIR, "agenda.db"))
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class AgendamentoDB(Base):
    __tablename__ = "agendamentos"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    whatsapp = Column(String, nullable=True)
    data = Column(Date, nullable=False)
    hora = Column(Time, nullable=False)
    servico = Column(String, nullable=False)
    status = Column(String, default="Agendado")
    status_pagamento = Column(String, default="Pendente")

class ServicoDB(Base):
    __tablename__ = "servicos"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    tempo = Column(Integer, nullable=False)
    valor = Column(Float, nullable=False)

class BloqueioDB(Base):
    __tablename__ = "bloqueios"
    id = Column(Integer, primary_key=True, index=True)
    data = Column(Date, nullable=False)
    motivo = Column(String, nullable=False)
    hora_inicio = Column(Time, nullable=True)
    hora_fim = Column(Time, nullable=True)

class HorarioFuncionamentoDB(Base):
    __tablename__ = "horarios_funcionamento"
    id = Column(Integer, primary_key=True, index=True)
    dia_semana = Column(Integer, unique=True, nullable=False)
    aberto = Column(Boolean, default=True)
    hora_abertura = Column(Time, nullable=False)
    hora_fechamento = Column(Time, nullable=False)

class LembreteEnviadoDB(Base):
    __tablename__ = "lembretes_enviados"
    id = Column(Integer, primary_key=True, index=True)
    agendamento_id = Column(Integer, nullable=False)
    tipo_mensagem = Column(String, nullable=False)
    whatsapp_enviado = Column(String, nullable=False)
    data_envio = Column(String, default=lambda: datetime.now().isoformat())
    sucesso = Column(Boolean, default=True)

Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    inspector = inspect(engine)
    if 'whatsapp' not in [col['name'] for col in inspector.get_columns('agendamentos')]:
        conn.execute(text("ALTER TABLE agendamentos ADD COLUMN whatsapp VARCHAR DEFAULT '-'"))
        conn.execute(text("UPDATE agendamentos SET whatsapp = '-' WHERE whatsapp IS NULL"))
    if 'hora_inicio' not in [col['name'] for col in inspector.get_columns('bloqueios')]:
        conn.execute(text("ALTER TABLE bloqueios ADD COLUMN hora_inicio TIME"))
        conn.execute(text("ALTER TABLE bloqueios ADD COLUMN hora_fim TIME"))
    
    # Adiciona a coluna sucesso se ela nao existir na tabela de lembretes
    if 'lembretes_enviados' in inspector.get_table_names():
        if 'sucesso' not in [col['name'] for col in inspector.get_columns('lembretes_enviados')]:
            conn.execute(text("ALTER TABLE lembretes_enviados ADD COLUMN sucesso BOOLEAN DEFAULT 1"))
            
    conn.commit()

with SessionLocal() as db:
    if db.query(HorarioFuncionamentoDB).count() == 0:
        for i in range(7):
            db.add(HorarioFuncionamentoDB(dia_semana=i, aberto=(i!=6), hora_abertura=time(9, 0), hora_fechamento=time(19, 0)))
        db.commit()

class AgendamentoCreate(BaseModel):
    nome: str
    whatsapp: Optional[str] = None
    data: date
    hora: time
    servico: str

class AgendamentoUpdate(BaseModel):
    nome: str
    whatsapp: Optional[str] = None
    data: date
    hora: time
    servico: str
    status: str
    status_pagamento: str

class AgendamentoResponse(BaseModel):
    id: int
    nome: str
    whatsapp: Optional[str] = "-"
    data: date
    hora: time
    servico: str
    status: str
    status_pagamento: str
    model_config = ConfigDict(from_attributes=True)

class ServicoCreate(BaseModel):
    nome: str
    tempo: int
    valor: float

class BloqueioCreate(BaseModel):
    data: date
    motivo: str
    hora_inicio: Optional[time] = None
    hora_fim: Optional[time] = None

class HorarioDiaUpdate(BaseModel):
    dia_semana: int
    aberto: bool
    hora_abertura: str
    hora_fechamento: str

async def processar_lembretes_automaticos():
    while True:
        await asyncio.sleep(60)
        try:
            if not bot_instance.connected: continue
            
            config = carregar_json_seguro(WA_CONFIG_FILE, {})
            
            if not config.get("lembretesAtivos", True): continue
            antecedencia = int(config.get("tempoAntecedenciaMinutos", 60))
            
            db = SessionLocal()
            agora = datetime.now()
            limite_maximo = agora + timedelta(minutes=antecedencia)
            
            agendamentos = db.query(AgendamentoDB).filter(
                AgendamentoDB.data == agora.date(),
                AgendamentoDB.status == "Agendado",
                AgendamentoDB.whatsapp.isnot(None),
                AgendamentoDB.whatsapp != "-",
                AgendamentoDB.whatsapp != ""
            ).all()
            
            for ag in agendamentos:
                ag_dt = datetime.combine(ag.data, ag.hora)
                if agora < ag_dt <= limite_maximo:
                    ja_enviou = db.query(LembreteEnviadoDB).filter(
                        LembreteEnviadoDB.agendamento_id == ag.id,
                        LembreteEnviadoDB.tipo_mensagem == "lembrete"
                    ).first()
                    
                    if not ja_enviou:
                        nome_curto = ag.nome.split(" ")[0]
                        mensagem = f"🤝 *Olá, {nome_curto}!* \n\nPassando para lembrar do seu horário na *Dom Cabral Barbershop* hoje às *{ag.hora.strftime('%H:%M')}* para o serviço de *{ag.servico}*.\n\nTe esperamos lá! ✂️"
                        
                        sucesso, _ = await bot_instance.send_message(ag.whatsapp, mensagem)
                        
                        if sucesso:
                            log_entry = {"data": datetime.now().isoformat(), "numero": ag.whatsapp, "mensagem": mensagem[:100], "sucesso": True}
                            logs = carregar_json_seguro(WA_LOGS_FILE, [])
                            logs.append(log_entry)
                            salvar_json_seguro(WA_LOGS_FILE, logs)
                        
                        db.add(LembreteEnviadoDB(agendamento_id=ag.id, tipo_mensagem="lembrete", whatsapp_enviado=ag.whatsapp, sucesso=sucesso))
                        db.commit()
            db.close()
        except Exception as e:
            print(f"Erro no auto-lembrete: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("\n" + "="*60)
    print("🚀 INICIANDO SISTEMA DOM CABRAL BARBERSHOP")
    print("="*60)
    asyncio.create_task(bot_instance.start())
    asyncio.create_task(processar_lembretes_automaticos()) 
    yield
    print("🛑 Encerrando conexões...")
    await bot_instance.stop()

app = FastAPI(title="API Barbearia Dom Cabral", lifespan=lifespan)
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS", "admin123")
active_tokens = {}

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def verificar_autenticacao(request: Request):
    token = request.cookies.get("admin_token")
    if not token or token not in active_tokens: return False
    if datetime.now() - active_tokens[token] > timedelta(hours=24):
        del active_tokens[token]
        return False
    return True

def verificar_token_api(request: Request):
    if not verificar_autenticacao(request): raise HTTPException(status_code=401, detail="Não autorizado")
    return True

def obter_precos_dinamicos(db: Session):
    return {s.nome: s.valor for s in db.query(ServicoDB).all()}

def carregar_json_seguro(caminho: str, padrao):
    if not os.path.exists(caminho):
        return padrao
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao

def salvar_json_seguro(caminho: str, dados):
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    with open(os.path.join(BASE_DIR, "login.html"), "r", encoding="utf-8") as f: return HTMLResponse(content=f.read())

@app.post("/fazer-login")
async def fazer_login(username: str = Form(...), password: str = Form(...)):
    if username == ADMIN_USER and password == ADMIN_PASS:
        token = secrets.token_hex(32)
        active_tokens[token] = datetime.now()
        response = RedirectResponse(url="/admin", status_code=303)
        response.set_cookie(key="admin_token", value=token, httponly=True, max_age=86400)
        return response
    return RedirectResponse(url="/login?erro=1", status_code=303)

@app.get("/verificar-auth")
async def verificar_auth(request: Request):
    return {"autenticado": verificar_autenticacao(request)}

@app.get("/logout")
async def logout(request: Request):
    token = request.cookies.get("admin_token")
    if token and token in active_tokens: del active_tokens[token]
    response = RedirectResponse(url="/login", status_code=303)
    response.delete_cookie("admin_token")
    return response

@app.get("/", response_class=HTMLResponse)
async def home():
    with open(os.path.join(BASE_DIR, "cliente.html"), "r", encoding="utf-8") as f: return HTMLResponse(content=f.read())

@app.get("/admin", response_class=HTMLResponse)
async def admin_panel(request: Request):
    if not verificar_autenticacao(request): return RedirectResponse(url="/login", status_code=303)
    with open(os.path.join(BASE_DIR, "admin.html"), "r", encoding="utf-8") as f: return HTMLResponse(content=f.read())

@app.get("/admin_bot.js")
async def serve_admin_bot():
    return FileResponse(os.path.join(BASE_DIR, "admin_bot.js"), media_type="application/javascript")

@app.post("/agendar", response_model=AgendamentoResponse, status_code=status.HTTP_201_CREATED)
async def criar_agendamento(agendamento: AgendamentoCreate, db: Session = Depends(get_db)):
    servico_req = db.query(ServicoDB).filter(ServicoDB.nome == agendamento.servico).first()
    duracao_req = servico_req.tempo if servico_req else 30
    start_req = datetime.combine(agendamento.data, agendamento.hora)
    end_req = start_req + timedelta(minutes=duracao_req)

    for b in db.query(BloqueioDB).filter(BloqueioDB.data == agendamento.data).all():
        if b.hora_inicio is None: raise HTTPException(status_code=400, detail=f"Data indisponível: {b.motivo}")
        if start_req < datetime.combine(b.data, b.hora_fim) and end_req > datetime.combine(b.data, b.hora_inicio):
            raise HTTPException(status_code=400, detail=f"Horário bloqueado: {b.motivo}")

    horario_func = db.query(HorarioFuncionamentoDB).filter(HorarioFuncionamentoDB.dia_semana == agendamento.data.weekday()).first()
    if not horario_func or not horario_func.aberto: raise HTTPException(status_code=400, detail="Barbearia fechada neste dia.")
    if agendamento.hora < horario_func.hora_abertura: raise HTTPException(status_code=400, detail=f"Aberto às {horario_func.hora_abertura.strftime('%H:%M')}")
    if end_req.time() > horario_func.hora_fechamento: raise HTTPException(status_code=400, detail=f"Serviço termina após expediente")

    for a in db.query(AgendamentoDB).filter(AgendamentoDB.data == agendamento.data, AgendamentoDB.status != "Cancelado").all():
        s_exist = db.query(ServicoDB).filter(ServicoDB.nome == a.servico).first()
        if start_req < datetime.combine(a.data, a.hora) + timedelta(minutes=(s_exist.tempo if s_exist else 30)) and end_req > datetime.combine(a.data, a.hora):
            raise HTTPException(status_code=400, detail="Horário indisponível")
    
    novo = AgendamentoDB(nome=agendamento.nome, whatsapp=agendamento.whatsapp, data=agendamento.data, hora=agendamento.hora, servico=agendamento.servico)
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo

@app.get("/agendamentos", response_model=List[AgendamentoResponse])
async def listar_agendamentos(request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    return db.query(AgendamentoDB).order_by(AgendamentoDB.data.asc(), AgendamentoDB.hora.asc()).all()

@app.put("/agendamentos/{agendamento_id}", response_model=AgendamentoResponse)
async def atualizar_agendamento(agendamento_id: int, ag_atualizado: AgendamentoUpdate, request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    agendamento = db.query(AgendamentoDB).filter(AgendamentoDB.id == agendamento_id).first()
    if not agendamento: raise HTTPException(status_code=404, detail="Não encontrado")
    
    for key, value in ag_atualizado.model_dump().items(): setattr(agendamento, key, value)
    db.commit()
    db.refresh(agendamento)
    return agendamento

@app.delete("/agendamentos/{agendamento_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_agendamento(agendamento_id: int, request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    agendamento = db.query(AgendamentoDB).filter(AgendamentoDB.id == agendamento_id).first()
    if agendamento: db.delete(agendamento); db.commit()

@app.get("/servicos")
async def listar_servicos(db: Session = Depends(get_db)): return db.query(ServicoDB).all()

@app.post("/servicos")
async def criar_servico(servico: ServicoCreate, request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    novo = ServicoDB(nome=servico.nome, tempo=servico.tempo, valor=servico.valor)
    db.add(novo); db.commit(); db.refresh(novo)
    return novo

@app.delete("/servicos/{id}")
async def deletar_servico(id: int, request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    servico = db.query(ServicoDB).filter(ServicoDB.id == id).first()
    if servico: db.delete(servico); db.commit()

@app.get("/horarios-disponiveis")
def get_horarios_disponiveis(data: str, servico: str, db: Session = Depends(get_db)):
    data_obj = datetime.strptime(data, "%Y-%m-%d").date()
    dia_semana = data_obj.weekday()

    # 1. Verifica se a barbearia está aberta neste dia
    horario_func = db.query(HorarioFuncionamentoDB).filter(HorarioFuncionamentoDB.dia_semana == dia_semana).first()
    if not horario_func or not horario_func.aberto:
        return {"horarios": []}

    # 2. Descobre quanto tempo O NOVO SERVIÇO vai demorar
    servico_req = db.query(ServicoDB).filter(ServicoDB.nome == servico).first()
    tempo_novo_servico = servico_req.tempo if servico_req else 30 # Padrão 30 min se não achar

    # 3. Lista de "blocos ocupados" (Agendamentos + Bloqueios do Admin)
    ocupados = []

    # 3.1 Pega os Bloqueios Excepcionais (Feriados, médico, almoço)
    bloqueios_do_dia = db.query(BloqueioDB).filter(BloqueioDB.data == data_obj).all()
    for b in bloqueios_do_dia:
        if b.hora_inicio is None:
            return {"horarios": []} # O dia inteiro foi bloqueado
        else:
            inicio_blq = datetime.combine(data_obj, b.hora_inicio)
            fim_blq = datetime.combine(data_obj, b.hora_fim)
            ocupados.append((inicio_blq, fim_blq))

    # 3.2 Pega os Agendamentos já marcados para este dia
    agendamentos_do_dia = db.query(AgendamentoDB).filter(
        AgendamentoDB.data == data_obj, 
        AgendamentoDB.status != 'Cancelado'
    ).all()
    
    for ag in agendamentos_do_dia:
        # Descobre o tempo do serviço que JÁ ESTÁ agendado
        ag_servico = db.query(ServicoDB).filter(ServicoDB.nome == ag.servico).first()
        ag_tempo = ag_servico.tempo if ag_servico else 30
        
        inicio_ag = datetime.combine(data_obj, ag.hora)
        fim_ag = inicio_ag + timedelta(minutes=ag_tempo)
        ocupados.append((inicio_ag, fim_ag))

    # 4. GERA OS HORÁRIOS DISPONÍVEIS
    horarios_disponiveis = []
    hora_atual = datetime.combine(data_obj, horario_func.hora_abertura)
    hora_fechamento = datetime.combine(data_obj, horario_func.hora_fechamento)
    agora = datetime.now()

    while hora_atual < hora_fechamento:
        # Calcula que horas ESSE serviço terminaria se começasse 'hora_atual'
        hora_fim_estimada = hora_atual + timedelta(minutes=tempo_novo_servico)
        
        # Regra A: O serviço precisa terminar ANTES da barbearia fechar
        # Regra B: O horário não pode já ter passado (se o agendamento for pra hoje)
        if hora_fim_estimada <= hora_fechamento and hora_atual > agora:
            
            # Regra C: O bloco inteiro (Início -> Fim Estimado) não pode bater em nada ocupado
            conflito = False
            for inicio_oc, fim_oc in ocupados:
                # Matemática de sobreposição: Se um começa antes do outro terminar, eles bateram.
                if hora_atual < fim_oc and hora_fim_estimada > inicio_oc:
                    conflito = True
                    break
            
            if not conflito:
                horarios_disponiveis.append(hora_atual.strftime("%H:%M"))
        
        # Avança com base no tempo EXATO do novo serviço (Flexibilidade aplicada)
        hora_atual += timedelta(minutes=tempo_novo_servico) 

    return {"horarios": horarios_disponiveis}

@app.get("/clientes")
async def listar_clientes(request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    precos = obter_precos_dinamicos(db)
    resultados = db.query(AgendamentoDB.nome, func.count(AgendamentoDB.id).label("t"), func.sum(case((AgendamentoDB.status == "Concluído", 1), else_=0)).label("c"), func.max(AgendamentoDB.data).label("u")).group_by(AgendamentoDB.nome).all()
    return [{"nome": n, "total_agendamentos": t, "concluidos": c or 0, "total_gasto": sum(precos.get(a.servico, 0) for a in db.query(AgendamentoDB).filter(AgendamentoDB.nome == n, AgendamentoDB.status == "Concluído", AgendamentoDB.status_pagamento == "Pago").all()), "ultima_visita": u.strftime("%d/%m/%Y") if u else "-"} for n, t, c, u in resultados]

@app.get("/financeiro/resumo")
async def resumo_financeiro(request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    precos = obter_precos_dinamicos(db)
    hoje = date.today()
    todos = db.query(AgendamentoDB).all()
    r_total = sum(precos.get(a.servico, 0) for a in todos if a.status == "Concluído" and a.status_pagamento == "Pago")
    r_mes = sum(precos.get(a.servico, 0) for a in todos if a.status == "Concluído" and a.status_pagamento == "Pago" and a.data >= date(hoje.year, hoje.month, 1))
    conc = [a for a in todos if a.status == "Concluído"]
    return {"receita_total": r_total, "receita_mes": r_mes, "pendentes": len([a for a in todos if a.status == "Concluído" and a.status_pagamento == "Pendente"]), "ticket_medio": sum(precos.get(a.servico, 0) for a in conc) / len(conc) if conc else 0}

@app.get("/financeiro/receita-por-mes")
async def receita_por_mes(request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    precos = obter_precos_dinamicos(db)
    meses = {}
    for a in db.query(AgendamentoDB).filter(AgendamentoDB.status == "Concluído", AgendamentoDB.status_pagamento == "Pago").all():
        chave = f"{a.data.year}-{a.data.month:02d}"
        meses[chave] = meses.get(chave, 0) + precos.get(a.servico, 0)
    return [{"mes": k, "receita": v} for k, v in sorted(meses.items())]

@app.get("/horarios")
async def listar_horarios(db: Session = Depends(get_db)): return db.query(HorarioFuncionamentoDB).order_by(HorarioFuncionamentoDB.dia_semana.asc()).all()

@app.put("/horarios")
async def atualizar_horarios(horarios: List[HorarioDiaUpdate], request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    for h in horarios:
        db_h = db.query(HorarioFuncionamentoDB).filter(HorarioFuncionamentoDB.dia_semana == h.dia_semana).first()
        if db_h: db_h.aberto = h.aberto; db_h.hora_abertura = datetime.strptime(h.hora_abertura, "%H:%M").time(); db_h.hora_fechamento = datetime.strptime(h.hora_fechamento, "%H:%M").time()
    db.commit()
    return {"status": "ok"}

@app.get("/bloqueios")
async def listar_bloqueios(db: Session = Depends(get_db)): return db.query(BloqueioDB).order_by(BloqueioDB.data.desc()).all()

@app.post("/bloqueios")
async def criar_bloqueio(bloqueio: BloqueioCreate, request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    novo = BloqueioDB(data=bloqueio.data, motivo=bloqueio.motivo, hora_inicio=bloqueio.hora_inicio, hora_fim=bloqueio.hora_fim)
    db.add(novo); db.commit(); db.refresh(novo)
    return novo

@app.delete("/bloqueios/{id}")
async def deletar_bloqueio(id: int, request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    b = db.query(BloqueioDB).filter(BloqueioDB.id == id).first()
    if b: db.delete(b); db.commit()

# ==========================================
# ROTAS PÚBLICAS PARA UX DO CLIENTE
# ==========================================
@app.get("/api/config-agenda")
async def get_config_agenda(db: Session = Depends(get_db)):
    bloqueios = db.query(BloqueioDB).all()
    horarios = db.query(HorarioFuncionamentoDB).all()
    dias_fechados = [h.dia_semana for h in horarios if not h.aberto]
    return {"bloqueios": [b.data.strftime("%Y-%m-%d") for b in bloqueios], "dias_fechados": dias_fechados}

@app.get("/api/horarios-disponiveis")
async def api_get_horarios_disponiveis(data: date, servico: str, db: Session = Depends(get_db)):
    resultado = get_horarios_disponiveis(data.strftime("%Y-%m-%d"), servico, db)
    return resultado.get("horarios", [])

# ============================================================
# ROTAS WHATSAPP BOT (API)
# ============================================================
@app.get("/api/whatsapp/status")
async def api_whatsapp_status(request: Request):
    verificar_token_api(request)

    status_texto = bot_instance.status_texto or "disconnected"

    status_front_map = {
        "connected": "CONECTADO",
        "qr_ready": "AGUARDANDO_QR",
        "connecting": "INICIANDO",
        "authenticating": "AUTENTICANDO",
        "disconnected": "DESCONECTADO",
        "error": "ERRO",
    }

    print(
        f"🔎 API /api/whatsapp/status | "
        f"status={status_texto} | "
        f"connected={bot_instance.connected} | "
        f"qr_presente={bool(bot_instance.qr_code_base64)} | "
        f"erro={getattr(bot_instance, 'last_error', None)}",
        flush=True
    )

    return {
        "connected": bot_instance.connected,
        "qrCode": bot_instance.qr_code_base64,
        "statusTexto": status_texto,
        "ultimaAtualizacao": datetime.now().isoformat(),
        "qr": bot_instance.qr_code_base64,
        "status": status_front_map.get(status_texto, "DESCONECTADO"),
        "erro": getattr(bot_instance, "last_error", None),
    }

@app.post("/api/whatsapp/send")
async def api_whatsapp_send(request: Request, dados: dict):
    verificar_token_api(request)
    numero, mensagem = dados.get("numero"), dados.get("mensagem")
    if not numero or not mensagem: raise HTTPException(status_code=400, detail="Faltando número ou mensagem")
    
    sucesso, msg_retorno = await bot_instance.send_message(numero, mensagem)
    if sucesso:
        logs = carregar_json_seguro(WA_LOGS_FILE, [])
        logs.append({"data": datetime.now().isoformat(), "numero": numero, "mensagem": mensagem[:100], "sucesso": True})
        salvar_json_seguro(WA_LOGS_FILE, logs)
        return {"status": "ok", "mensagem": msg_retorno}
    raise HTTPException(status_code=500, detail=msg_retorno)

@app.post("/api/whatsapp/reconnect")
async def api_whatsapp_reconnect(request: Request):
    verificar_token_api(request)
    await bot_instance.restart()
    return {"status": "ok", "mensagem": "Reconexão iniciada! Aguarde o QR Code."}

@app.get("/whatsapp/estatisticas")
async def whatsapp_estatisticas(request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    logs = carregar_json_seguro(WA_LOGS_FILE, [])
    
    hoje_str = date.today().isoformat()
    sucesso = sum(1 for l in logs if l.get("sucesso") is True)
    
    agora = datetime.now()
    prox = db.query(AgendamentoDB).filter(
        AgendamentoDB.data >= agora.date(),
        AgendamentoDB.status == "Agendado",
        AgendamentoDB.whatsapp != "-",
        AgendamentoDB.whatsapp != ""
    ).order_by(AgendamentoDB.data, AgendamentoDB.hora).first()
    
    proximo_txt = "Nenhum agendado"
    if prox:
        prox_dt = datetime.combine(prox.data, prox.hora)
        if prox_dt > agora:
            proximo_txt = f"{prox_dt.strftime('%d/%m às %H:%M')}"
            
    return {
        "total_enviadas": len(logs),
        "enviadas_hoje": sum(1 for l in logs if str(l.get("data", "")).startswith(hoje_str)),
        "taxa_sucesso": round((sucesso / len(logs) * 100), 1) if logs else 0,
        "proximo_lembrete": proximo_txt
    }

@app.get("/whatsapp/logs")
async def whatsapp_logs(request: Request, busca: str = "", pagina: int = 1, limite: int = 25):
    verificar_token_api(request)
    logs = carregar_json_seguro(WA_LOGS_FILE, [])
    
    ls = sorted(logs, key=lambda x: x.get("data", ""), reverse=True)
    if busca: ls = [l for l in ls if busca.lower() in str(l.get("numero", "")).lower()]
    return {"logs": ls[(pagina - 1) * limite : pagina * limite], "total": len(ls), "pagina": pagina, "limite": limite}

@app.get("/whatsapp/config")
async def whatsapp_config_get(request: Request):
    verificar_token_api(request)
    return carregar_json_seguro(WA_CONFIG_FILE, {"tempoAntecedenciaMinutos": 60, "lembretesAtivos": True, "horarioMatinal": "08:00", "horarioVespertino": "13:00"})

@app.post("/whatsapp/config")
async def whatsapp_config_post(request: Request, config: dict):
    verificar_token_api(request)
    config_atual = carregar_json_seguro(WA_CONFIG_FILE, {})
    config_atual.update(config)
    salvar_json_seguro(WA_CONFIG_FILE, config_atual)
    return {"status": "ok"}

@app.get("/whatsapp/agendamentos-para-teste")
async def agendamentos_para_teste(request: Request, db: Session = Depends(get_db)):
    verificar_token_api(request)
    agendamentos = db.query(AgendamentoDB).filter(AgendamentoDB.data >= date.today(), AgendamentoDB.status != "Cancelado", AgendamentoDB.whatsapp.isnot(None), AgendamentoDB.whatsapp != "", AgendamentoDB.whatsapp != "-").order_by(AgendamentoDB.data.asc(), AgendamentoDB.hora.asc()).limit(50).all()
    return [{"id": a.id, "nome": a.nome, "whatsapp": a.whatsapp, "data": a.data.strftime("%d/%m/%Y"), "hora": a.hora.strftime("%H:%M"), "servico": a.servico} for a in agendamentos]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
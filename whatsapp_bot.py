import asyncio
import base64
import json
import os
import shutil
from datetime import datetime
from io import BytesIO
from urllib.parse import quote

import qrcode
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright


BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class WhatsAppBot:
    def __init__(self, status_file="whatsapp_status.json"):
        self.status_file = os.path.join(BASE_DIR, status_file)
        self.connected = False
        self.qr_code_base64 = None
        self.status_texto = "disconnected"
        self.last_error = None
        self.page = None
        self.browser = None
        self.playwright = None
        self._running = False
        self.is_sending = False
        self.session_dir = os.path.join(BASE_DIR, "whatsapp_session")
        self._load_status_from_file()

    def _load_status_from_file(self):
        try:
            if os.path.exists(self.status_file):
                with open(self.status_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.connected = bool(data.get("connected", False))
                self.qr_code_base64 = data.get("qrCode")
                self.status_texto = data.get("statusTexto") or "disconnected"
        except Exception:
            self.connected = False
            self.qr_code_base64 = None
            self.status_texto = "disconnected"

    def _update_status(self, status_texto, qr_code=None, erro=None):
        self.status_texto = status_texto
        self.connected = status_texto == "connected"
        self.last_error = erro

        if status_texto == "qr_ready" and qr_code:
            self.qr_code_base64 = qr_code

        elif status_texto in {"connected", "disconnected", "error"}:
            self.qr_code_base64 = None

        dados = {
            "connected": self.connected,
            "qrCode": self.qr_code_base64,
            "statusTexto": self.status_texto,
            "erro": self.last_error,
            "ultimaAtualizacao": datetime.now().isoformat(),
        }

        print(
            f"📊 Status WhatsApp atualizado: {status_texto} | "
            f"connected={self.connected} | "
            f"qr_presente={bool(self.qr_code_base64)} | "
            f"erro={erro}",
            flush=True
        )

        try:
            with open(self.status_file, "w", encoding="utf-8") as f:
                json.dump(dados, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"⚠️ Não foi possível salvar status do WhatsApp: {e}", flush=True)

    def _generate_qr_base64(self, qr_string):
        qr = qrcode.QRCode(version=1, box_size=10, border=2)
        qr.add_data(qr_string)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffered = BytesIO()
        img.save(buffered, format="PNG")
        return f"data:image/png;base64,{base64.b64encode(buffered.getvalue()).decode()}"

    async def _ensure_page(self):
        if self.page and not self.page.is_closed():
            return self.page
        if self.browser:
            self.page = self.browser.pages[0] if self.browser.pages else await self.browser.new_page()
            return self.page
        return None

    async def start(self):
        if self._running:
            return

        self._running = True
        self._update_status("connecting")

        try:
            os.makedirs(self.session_dir, exist_ok=True)
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch_persistent_context(
                user_data_dir=self.session_dir,
                headless=True,
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1366, "height": 768},
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-extensions",
                    "--disable-blink-features=AutomationControlled",
                ],
            )

            self.page = self.browser.pages[0] if self.browser.pages else await self.browser.new_page()
            await self.page.goto("https://web.whatsapp.com", wait_until="domcontentloaded", timeout=60000)
            print("🌐 WhatsApp Web carregado. Buscando QR Code...")

            tentativas_sem_qr = 0
            ultimo_qr_data = None

            while self._running:
                if self.is_sending:
                    await asyncio.sleep(2)
                    continue

                try:
                    page = await self._ensure_page()
                    if not page:
                        raise RuntimeError("Página do WhatsApp não está disponível.")

                    is_logged = await page.locator('div[id="pane-side"]').count() > 0
                    if is_logged:
                        if not self.connected:
                            print("✅ WhatsApp conectado com sucesso!")
                        self._update_status("connected")
                        tentativas_sem_qr = 0
                    else:
                        qr_data = None
                        qr_locator = page.locator("[data-ref]")
                        if await qr_locator.count() > 0:
                            qr_data = await qr_locator.first.get_attribute("data-ref")

                        if qr_data:
                            tentativas_sem_qr = 0
                            if qr_data != ultimo_qr_data:
                                ultimo_qr_data = qr_data
                                print("📱 Novo QR Code gerado. Acesse o painel para escanear.")
                                self._update_status("qr_ready", self._generate_qr_base64(qr_data))
                        else:
                            tentativas_sem_qr += 1
                            if self.status_texto != "connecting":
                                self._update_status("connecting")
                            if tentativas_sem_qr >= 20:
                                print("🔄 QR Code demorou a aparecer. Recarregando WhatsApp Web...")
                                await page.goto("https://web.whatsapp.com", wait_until="domcontentloaded", timeout=60000)
                                tentativas_sem_qr = 0

                except PlaywrightTimeoutError as e:
                    self._update_status("error", erro="Tempo esgotado ao carregar o WhatsApp Web.")
                    print(f"⚠️ Timeout no WhatsApp Web: {e}")
                    await asyncio.sleep(5)
                except Exception as e:
                    self._update_status("error", erro=str(e))
                    print(f"⚠️ Erro durante verificação do WhatsApp: {e}")
                    await asyncio.sleep(5)

                await asyncio.sleep(3)

        except Exception as e:
            erro = str(e)
            print(f"❌ Erro fatal no bot: {erro}")
            self._update_status("error", erro=erro)
            self._running = False

    async def stop(self):
        self._running = False
        try:
            if self.browser:
                await self.browser.close()
        finally:
            self.browser = None
            self.page = None
        try:
            if self.playwright:
                await self.playwright.stop()
        finally:
            self.playwright = None
        self._update_status("disconnected")

    async def restart(self):
        print("🔄 Reiniciando bot e limpando sessão...")
        await self.stop()
        if os.path.exists(self.session_dir):
            shutil.rmtree(self.session_dir, ignore_errors=True)
        asyncio.create_task(self.start())

    async def send_message(self, number, message):
        if not self.connected:
            return False, "WhatsApp não está conectado."

        self.is_sending = True
        try:
            clean_number = "".join(filter(str.isdigit, str(number)))
            if len(clean_number) <= 11:
                clean_number = "55" + clean_number

            page = await self._ensure_page()
            if not page:
                return False, "Página do WhatsApp não está disponível."

            url = f"https://web.whatsapp.com/send?phone={clean_number}&text={quote(message)}"
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)

            send_button = None
            selectors = [
                'button[aria-label="Enviar"]',
                'button[aria-label="Send"]',
                'span[data-icon="send"]',
            ]

            for _ in range(20):
                for selector in selectors:
                    send_button = await page.query_selector(selector)
                    if send_button:
                        break
                if send_button:
                    break
                await asyncio.sleep(1)

            if not send_button:
                raise RuntimeError("Botão de enviar não encontrado.")

            await asyncio.sleep(1)
            await send_button.click()
            await asyncio.sleep(3)

            print(f"✅ Mensagem enviada para {number}")
            await page.goto("https://web.whatsapp.com", wait_until="domcontentloaded", timeout=60000)
            return True, "Mensagem enviada com sucesso!"

        except Exception as e:
            erro = str(e)
            print(f"❌ Erro ao enviar para {number}: {erro}")
            try:
                page = await self._ensure_page()
                if page:
                    await page.goto("https://web.whatsapp.com", wait_until="domcontentloaded", timeout=60000)
            except Exception:
                pass
            return False, erro
        finally:
            self.is_sending = False


bot_instance = WhatsAppBot()

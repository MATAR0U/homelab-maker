# ------------------------------------------------------------
#  app/main.py
# ------------------------------------------------------------
from fastapi import FastAPI, HTTPException, Path, Body, Request, Depends, Form, status, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import docker
import os
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import JWTError, jwt
import pathlib
from passlib.context import CryptContext

# ------------------------------------------------------------
#  Configuration / secrets
# ------------------------------------------------------------
USERNAME = os.getenv("HOMELAB_USER")
PWD_HASH = os.getenv("HOMELAB_PASSWORD_HASH")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES"))

# Utilisation d’Argon2 (pas de limite de 72 octets)
pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


def verify_password(plain_pwd: str, hashed_pwd: str) -> bool:
    """Vérifie le mot de passe en laissant passlib gérer la troncature."""
    return pwd_context.verify(plain_pwd, hashed_pwd)


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=JWT_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        return username
    except JWTError:
        raise credentials_exception


credentials_exception = HTTPException(
    status_code=status.HTTP_302_FOUND,   # on redirige vers /login
    detail="Non authentifié",
    headers={"Location": "/login"},
)


# ------------------------------------------------------------
#  FastAPI instance
# ------------------------------------------------------------
app = FastAPI()


# ------------------------------------------------------------
#  Middleware – bloquer tout sauf /login, /static/* et la page d’accueil (/)
# ------------------------------------------------------------
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """
    Autorise :
    - le endpoint de login (GET + POST)
    - les assets statiques (/static/*)
    - toute requête qui présente un JWT valide,
      que ce JWT soit fourni via le header Authorization
      OU via le cookie « access_token ».
    Sinon, redirige vers /login.
    """
    path = request.url.path

    # -----------------------------------------------------------------
    # 1️⃣  Autorisations publiques (pas besoin de token)
    # -----------------------------------------------------------------
    if path.startswith("/login") or path.startswith("/static"):
        return await call_next(request)

    # -----------------------------------------------------------------
    # 2️⃣  Recherche du token
    # -----------------------------------------------------------------
    token: str | None = None

    # 2a) Header Authorization :  "Bearer <jwt>"
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:]  # retire le préfixe "Bearer "

    # 2b) Si aucun token dans le header, on regarde le cookie
    if not token:
        token = request.cookies.get("access_token")   # <-- nom du cookie

    # -----------------------------------------------------------------
    # 3️⃣  Validation du token (si on en a trouvé un)
    # -----------------------------------------------------------------
    if token:
        try:
            # decode_token lève une exception si le JWT est invalide ou expiré
            decode_token(token)
            # (Optionnel) on peut mettre le token dans request.state
            # pour le ré‑utiliser plus loin dans les routes.
            request.state.jwt = token
            return await call_next(request)
        except HTTPException:
            # Token présent mais invalide → on passe à la suite (redirection)
            pass

    # -----------------------------------------------------------------
    # 4️⃣  Aucun token valide → on redirige vers la page de login
    # -----------------------------------------------------------------
    return RedirectResponse(url="/login", status_code=302)


# ------------------------------------------------------------
#  1️⃣  Fichiers statiques (frontend)
# ------------------------------------------------------------
app.mount("/static", StaticFiles(directory="static"), name="static")


# ------------------------------------------------------------
#  2️⃣  Client Docker (socket Unix)
# ------------------------------------------------------------
docker_client = docker.DockerClient(base_url="unix:///var/run/docker.sock")


# ------------------------------------------------------------
#  3️⃣  Modèle de payload pour les actions Docker
# ------------------------------------------------------------
class ActionPayload(BaseModel):
    action: str   # start | stop | restart | remove


# ------------------------------------------------------------
#  4️⃣  Page de login (GET) – renvoie le fichier static/login.html
# ------------------------------------------------------------
# ------------------------------------------------------------
#  4️⃣  Page de login (GET) – renvoie le fichier static/login.html
# ------------------------------------------------------------
@app.get("/login", response_class=HTMLResponse)
def login_page():
    """
    Retourne le formulaire de connexion qui se trouve dans
    le répertoire static/login.html.
    """
    # Chemin absolu du fichier login.html dans le conteneur
    base_path = pathlib.Path(__file__).parent.parent   # /app
    login_path = base_path / "static" / "login.html"
    return FileResponse(login_path, media_type="text/html")


# ------------------------------------------------------------
#  5️⃣  Traitement du login (POST) – renvoie le JWT dans le body
# ------------------------------------------------------------
@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Vérifie les credentials, crée un JWT et le renvoie.
    Le token est également placé dans un cookie (facultatif).
    """
    if form_data.username != USERNAME or not verify_password(form_data.password, PWD_HASH):
        raise HTTPException(status_code=400, detail="Identifiants invalides")

    access_token = create_access_token(data={"sub": USERNAME})

    # ---- 1️⃣  Crée la réponse JSON
    response = JSONResponse(content={"access_token": access_token, "token_type": "bearer"})

    # ---- 2️⃣  (Optionnel) Pose le cookie – utile si vous décidez d’utiliser le cookie côté serveur
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=JWT_EXPIRE_MINUTES * 60,
        httponly=False,          # mettre True en prod + secure=True
        secure=False,            # mettre True en prod (HTTPS)
        samesite="lax"
    )
    return response


# ------------------------------------------------------------
#  6️⃣  Page d’accueil (HTML) – même que avant
# ------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def root():
    index_path = os.path.join("static", "index.html")
    with open(index_path, encoding="utf-8") as f:
        return f.read()


# ------------------------------------------------------------
#  7️⃣  API – liste des conteneurs (GET) – protégée par le middleware
# ------------------------------------------------------------
@app.get("/containers")
def list_containers():
    try:
        containers = docker_client.containers.list(all=True)
        return [
            {"id": c.id[:12], "name": c.name, "status": c.status}
            for c in containers
        ]
    except docker.errors.APIError as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ------------------------------------------------------------
#  8️⃣  API – action sur un conteneur (POST) – protégée
# ------------------------------------------------------------
@app.post("/containers/{cid}/action")
def container_action(
    cid: str = Path(..., description="Les 12 premiers caractères de l’ID"),
    payload: ActionPayload = Body(...),
):
    try:
        container = docker_client.containers.get(cid)
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Conteneur introuvable")
    except docker.errors.APIError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    action = payload.action.lower()
    if action == "start":
        container.start()
    elif action == "stop":
        container.stop()
    elif action == "restart":
        container.restart()
    elif action == "remove":
        container.remove(force=True)
    else:
        raise HTTPException(status_code=400, detail="Action inconnue")

    return {"status": "ok", "action": action, "id": cid}
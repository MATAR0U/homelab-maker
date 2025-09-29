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
import xml.etree.ElementTree as ET
import threading

# ------------------------------------------------------------
# Variable config
# ------------------------------------------------------------

_xml_lock = threading.Lock()
CONFIG_PATH = pathlib.Path("/config/config.xml")

def update_settings():
    global USERNAME, PWD_HASH, JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRE_MINUTES, REGISTER
    # ------------------------------------------------------------
    # Define global variable
    # ------------------------------------------------------------
    if not CONFIG_PATH.is_file():
        raise FileNotFoundError(f"Fichier de configuration introuvable : {CONFIG_PATH}")

    tree = ET.parse(CONFIG_PATH)
    root = tree.getroot()

    def _text(elem: ET.Element | None, default: str = "") -> str:
        """Helper : retourne le texte d’un élément ou la valeur par défaut."""
        return elem.text.strip() if elem is not None and elem.text else default

    USERNAME       = _text(root.find("./auth/username"))
    PWD_HASH       = _text(root.find("./auth/pwd_hash"))
    JWT_SECRET_KEY = _text(root.find("./jwt/secret_key"))
    JWT_ALGORITHM  = _text(root.find("./jwt/algorithm"))
    JWT_EXPIRE_MINUTES = int(_text(root.find("./jwt/expire_minutes")))


    if not USERNAME or not JWT_SECRET_KEY:
        raise ValueError("Configuration invalide : username ou secret_key manquant.")

    if PWD_HASH == "blank":
        REGISTER = False
    else:
        REGISTER = True

update_settings()

# ----------------------------------------------------------------------
# Load XML or return error
# ----------------------------------------------------------------------
def _load_config() -> ET.ElementTree:
    if not CONFIG_PATH.is_file():
        raise FileNotFoundError(f"Config file missing: {CONFIG_PATH}")
    return ET.parse(CONFIG_PATH)

# ----------------------------------------------------------------------
# Write XML
# ----------------------------------------------------------------------
def _write_config(tree: ET.ElementTree) -> None:
    tmp_path = CONFIG_PATH.with_suffix(".tmp")
    tree.write(tmp_path, encoding="utf-8", xml_declaration=True)
    # remplacement atomique – aucune fenêtre où le fichier serait partiellement écrit
    os.replace(tmp_path, CONFIG_PATH)

# ------------------------------------------------------------

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
    status_code=status.HTTP_302_FOUND, # redirect to /login
    detail="Non authentifié",
    headers={"Location": "/login"},
)



app = FastAPI()


# ------------------------------------------------------------
#  Middleware – block all except /login & /static/* & / (if valide cookie)
# ------------------------------------------------------------
@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    update_settings()

    path = request.url.path

    # -----------------------------------------------------------------
    # No cookie required
    # -----------------------------------------------------------------
    if path.startswith("/login") or path.startswith("/register") or path.startswith("/static"):
        return await call_next(request)


    token: str | None = None

    token = request.cookies.get("access_token")

    # -----------------------------------------------------------------
    # Check token validation
    # -----------------------------------------------------------------
    if token:
        try:
            # check if invalide or expired token
            decode_token(token)

            request.state.jwt = token
            return await call_next(request)
        except HTTPException:
            # Token exist but invalide
            pass

    # -----------------------------------------------------------------
    # No valide token, redirect to /login
    # -----------------------------------------------------------------
    if REGISTER:
        return RedirectResponse(url="/login", status_code=302)
    else:
        return RedirectResponse(url="/register", status_code=302)



app.mount("/static", StaticFiles(directory="static"), name="static")


# ------------------------------------------------------------
# Docker client (Unix socket)
# ------------------------------------------------------------
docker_client = docker.DockerClient(base_url="unix:///var/run/docker.sock")


# ------------------------------------------------------------
# Payload model for docker action
# ------------------------------------------------------------
class ActionPayload(BaseModel):
    action: str   # start | stop | restart | remove


# ------------------------------------------------------------
# GET - Register page
# ------------------------------------------------------------
@app.get("/register", response_class=HTMLResponse)
def register_page():
    base_path = pathlib.Path(__file__).parent.parent # /app
    login_path = base_path / "static" / "register.html"
    return FileResponse(login_path, media_type="text/html")


@app.post("/register")
def register(form_data: OAuth2PasswordRequestForm = Depends()):
    pwd_ctx = CryptContext(schemes=["argon2"])
    hashed_pwd = pwd_ctx.hash(form_data.password)

    # ----- Update XML (protect by lock) -----
    with _xml_lock: # <‑‑ critical section
        tree = _load_config()
        root = tree.getroot()

        # Check if <auth><pwd_hash> exist
        auth_elem = root.find("./auth")
        if auth_elem is None:
            auth_elem = ET.SubElement(root, "auth")

        pwd_hash_elem = auth_elem.find("pwd_hash")
        if pwd_hash_elem is None:
            pwd_hash_elem = ET.SubElement(auth_elem, "pwd_hash")

        pwd_hash_elem.text = hashed_pwd

        # Write xml
        _write_config(tree)
    
    REGISTER = True
    print(REGISTER)
    return {"detail": "Password hash stored successfully"}


# ------------------------------------------------------------
# GET - login page
# ------------------------------------------------------------
@app.get("/login", response_class=HTMLResponse)
def login_page():
    base_path = pathlib.Path(__file__).parent.parent # /app
    login_path = base_path / "static" / "login.html"
    return FileResponse(login_path, media_type="text/html")


# ------------------------------------------------------------
# POST - check credentials login page
# ------------------------------------------------------------
@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    if form_data.username != USERNAME or not verify_password(form_data.password, PWD_HASH):
        raise HTTPException(status_code=400, detail="Identifiants invalides")

    access_token = create_access_token(data={"sub": USERNAME})

    response = JSONResponse(content={"access_token": access_token, "token_type": "bearer"})

    # Set cookie with token
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=JWT_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=False,
        samesite="lax"
    )
    return response


# ------------------------------------------------------------
# Homepage
# ------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def root():
    index_path = os.path.join("static", "index.html")
    with open(index_path, encoding="utf-8") as f:
        return f.read()


# ------------------------------------------------------------
# GET - list containers
# ------------------------------------------------------------
@app.get("/api/containers")
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
# POST - action on containers
# ------------------------------------------------------------
@app.post("/api/containers/{cid}/action")
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
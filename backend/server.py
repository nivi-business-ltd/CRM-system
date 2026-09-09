from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query, UploadFile, File
import pandas as pd
import io
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import uuid
import logging
import bcrypt
import jwt

# --- DB ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
STAGES = ["Lead", "Contacted", "Proposal", "Negotiation", "Closed Won", "Closed Lost"]


# --- Security helpers ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# --- Models ---
class LoginInput(BaseModel):
    email: EmailStr
    password: str


class EmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class ClientInput(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    country: Optional[str] = ""
    services: Optional[str] = ""
    notes: Optional[str] = ""
    stage: str = "Lead"
    deal_value: float = 0.0
    assigned_to: Optional[str] = None


class TaskInput(BaseModel):
    title: str
    description: Optional[str] = ""
    due_date: Optional[str] = None
    priority: str = "Medium"
    status: str = "Pending"
    client_id: Optional[str] = None
    assigned_to: Optional[str] = None


def user_public(u: dict) -> dict:
    return {"id": u["id"] if "id" in u else str(u.get("_id")),
            "name": u.get("name"), "email": u.get("email"), "role": u.get("role")}


# --- Auth endpoints ---
@api_router.post("/auth/login")
async def login(data: LoginInput, response: Response):
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = str(user["_id"])
    token = create_access_token(uid, email)
    response.set_cookie("access_token", token, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")
    return {"token": token, "user": {"id": uid, "name": user["name"],
            "email": user["email"], "role": user["role"]}}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_public(user)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"success": True}


# --- Employee management (admin only) ---
@api_router.get("/employees")
async def list_employees(user: dict = Depends(get_current_user)):
    docs = await db.users.find({}).to_list(1000)
    result = []
    for d in docs:
        # count assigned clients
        cnt = await db.clients.count_documents({"assigned_to": str(d["_id"])})
        result.append({"id": str(d["_id"]), "name": d["name"], "email": d["email"],
                       "role": d["role"], "client_count": cnt})
    return result


@api_router.post("/employees")
async def create_employee(data: EmployeeCreate, admin: dict = Depends(require_admin)):
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {"name": data.name, "email": email, "password_hash": hash_password(data.password),
           "role": "employee", "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    return {"id": str(res.inserted_id), "name": data.name, "email": email, "role": "employee"}


@api_router.delete("/employees/{emp_id}")
async def delete_employee(emp_id: str, admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"_id": ObjectId(emp_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Employee not found")
    if target["role"] == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete an admin")
    await db.users.delete_one({"_id": ObjectId(emp_id)})
    # unassign their clients
    await db.clients.update_many({"assigned_to": emp_id}, {"$set": {"assigned_to": None}})
    return {"success": True}


# --- Client helpers ---
async def enrich_client(c: dict) -> dict:
    assignee_name = None
    if c.get("assigned_to"):
        a = await db.users.find_one({"_id": ObjectId(c["assigned_to"])}) if len(c["assigned_to"]) == 24 else None
        if a:
            assignee_name = a["name"]
    return {**{k: v for k, v in c.items() if k != "_id"}, "assignee_name": assignee_name}


def client_scope(user: dict) -> dict:
    if user["role"] == "admin":
        return {}
    return {"assigned_to": user["id"]}


# --- Client endpoints ---
@api_router.get("/clients")
async def list_clients(user: dict = Depends(get_current_user),
                       q: Optional[str] = None, stage: Optional[str] = None,
                       assigned_to: Optional[str] = None):
    query = client_scope(user)
    if user["role"] == "admin" and assigned_to:
        query["assigned_to"] = assigned_to
    if stage and stage != "all":
        query["stage"] = stage
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"country": {"$regex": q, "$options": "i"}},
            {"services": {"$regex": q, "$options": "i"}},
            {"company": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    docs = await db.clients.find(query).sort("created_at", -1).to_list(2000)
    return [await enrich_client(d) for d in docs]


@api_router.post("/clients")
async def create_client(data: ClientInput, user: dict = Depends(get_current_user)):
    if data.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    assigned = data.assigned_to
    if user["role"] != "admin":
        assigned = user["id"]  # employees can only create clients assigned to themselves
    doc = {
        "id": str(uuid.uuid4()), "name": data.name, "email": data.email or "",
        "phone": data.phone or "", "country": data.country or "", "services": data.services or "",
        "notes": data.notes or "",
        "stage": data.stage, "deal_value": float(data.deal_value or 0),
        "assigned_to": assigned, "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.clients.insert_one(doc)
    return await enrich_client(doc)


@api_router.post("/clients/import")
async def import_clients(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    fname = (file.filename or "").lower()
    try:
        if fname.endswith(".xlsx") or fname.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file. Use a valid CSV or Excel file. ({e})")

    df.columns = [str(c).strip().lower() for c in df.columns]

    def pick(row, *keys):
        for k in keys:
            if k in row and pd.notna(row[k]):
                return row[k]
        return None

    created, errors = 0, []
    now = datetime.now(timezone.utc).isoformat()
    for i, r in df.iterrows():
        row = r.to_dict()
        nm = pick(row, "name", "client name", "full name")
        if not nm or str(nm).strip() == "":
            errors.append(f"Row {int(i) + 2}: missing name")
            continue
        stage = str(pick(row, "stage", "pipeline stage") or "Lead").strip()
        if stage not in STAGES:
            stage = "Lead"
        dv_raw = pick(row, "deal_value", "deal value", "value", "amount")
        try:
            dv = float(str(dv_raw).replace(",", "").replace("₹", "").strip()) if dv_raw is not None else 0.0
        except Exception:
            dv = 0.0
        doc = {
            "id": str(uuid.uuid4()),
            "name": str(nm).strip(),
            "email": str(pick(row, "email", "e-mail") or "").strip(),
            "phone": str(pick(row, "phone", "mobile", "contact", "phone number") or "").strip(),
            "country": str(pick(row, "country", "location", "region") or "").strip(),
            "services": str(pick(row, "services", "service", "product") or "").strip(),
            "notes": str(pick(row, "notes", "note", "remarks") or "").strip(),
            "stage": stage,
            "deal_value": dv,
            "assigned_to": None if user["role"] == "admin" else user["id"],
            "created_by": user["id"],
            "created_at": now, "updated_at": now,
        }
        await db.clients.insert_one(doc)
        created += 1
    return {"created": created, "errors": errors, "total": int(len(df))}


async def get_owned_client(client_id: str, user: dict) -> dict:
    doc = await db.clients.find_one({"id": client_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Client not found")
    if user["role"] != "admin" and doc.get("assigned_to") != user["id"]:
        raise HTTPException(status_code=404, detail="Client not found")
    return doc


@api_router.get("/clients/{client_id}")
async def get_client(client_id: str, user: dict = Depends(get_current_user)):
    doc = await get_owned_client(client_id, user)
    return await enrich_client(doc)


@api_router.put("/clients/{client_id}")
async def update_client(client_id: str, data: ClientInput, user: dict = Depends(get_current_user)):
    await get_owned_client(client_id, user)
    if data.stage not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    update = {
        "name": data.name, "email": data.email or "", "phone": data.phone or "",
        "country": data.country or "", "services": data.services or "",
        "notes": data.notes or "", "stage": data.stage,
        "deal_value": float(data.deal_value or 0),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if user["role"] == "admin":
        update["assigned_to"] = data.assigned_to
    await db.clients.update_one({"id": client_id}, {"$set": update})
    doc = await db.clients.find_one({"id": client_id})
    return await enrich_client(doc)


@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)):
    await get_owned_client(client_id, user)
    await db.clients.delete_one({"id": client_id})
    await db.tasks.delete_many({"client_id": client_id})
    return {"success": True}


# --- Task endpoints ---
def task_scope(user: dict) -> dict:
    if user["role"] == "admin":
        return {}
    return {"assigned_to": user["id"]}


async def enrich_task(t: dict) -> dict:
    client_name = None
    if t.get("client_id"):
        c = await db.clients.find_one({"id": t["client_id"]})
        if c:
            client_name = c["name"]
    return {**{k: v for k, v in t.items() if k != "_id"}, "client_name": client_name}


@api_router.get("/tasks")
async def list_tasks(user: dict = Depends(get_current_user), status: Optional[str] = None):
    query = task_scope(user)
    if status and status != "all":
        query["status"] = status
    docs = await db.tasks.find(query).sort("due_date", 1).to_list(2000)
    return [await enrich_task(d) for d in docs]


@api_router.post("/tasks")
async def create_task(data: TaskInput, user: dict = Depends(get_current_user)):
    assigned = data.assigned_to if user["role"] == "admin" and data.assigned_to else user["id"]
    doc = {
        "id": str(uuid.uuid4()), "title": data.title, "description": data.description or "",
        "due_date": data.due_date, "priority": data.priority, "status": data.status,
        "client_id": data.client_id, "assigned_to": assigned, "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tasks.insert_one(doc)
    return await enrich_task(doc)


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, data: TaskInput, user: dict = Depends(get_current_user)):
    doc = await db.tasks.find_one({"id": task_id})
    if not doc or (user["role"] != "admin" and doc.get("assigned_to") != user["id"]):
        raise HTTPException(status_code=404, detail="Task not found")
    update = {"title": data.title, "description": data.description or "", "due_date": data.due_date,
              "priority": data.priority, "status": data.status, "client_id": data.client_id}
    if user["role"] == "admin" and data.assigned_to:
        update["assigned_to"] = data.assigned_to
    await db.tasks.update_one({"id": task_id}, {"$set": update})
    doc = await db.tasks.find_one({"id": task_id})
    return await enrich_task(doc)


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    doc = await db.tasks.find_one({"id": task_id})
    if not doc or (user["role"] != "admin" and doc.get("assigned_to") != user["id"]):
        raise HTTPException(status_code=404, detail="Task not found")
    await db.tasks.delete_one({"id": task_id})
    return {"success": True}


# --- Dashboard ---
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(require_admin)):
    scope = client_scope(user)
    clients = await db.clients.find(scope).to_list(5000)
    total_clients = len(clients)
    open_stages = [s for s in STAGES if s not in ("Closed Won", "Closed Lost")]
    active_deals = sum(1 for c in clients if c.get("stage") in open_stages)
    pipeline_value = sum(float(c.get("deal_value", 0)) for c in clients if c.get("stage") in open_stages)
    won_value = sum(float(c.get("deal_value", 0)) for c in clients if c.get("stage") == "Closed Won")
    won = sum(1 for c in clients if c.get("stage") == "Closed Won")
    lost = sum(1 for c in clients if c.get("stage") == "Closed Lost")
    closed = won + lost
    win_rate = round((won / closed) * 100) if closed else 0

    stage_dist = []
    for s in STAGES:
        group = [c for c in clients if c.get("stage") == s]
        stage_dist.append({"stage": s, "count": len(group),
                           "value": sum(float(c.get("deal_value", 0)) for c in group)})

    tscope = task_scope(user)
    upcoming = await db.tasks.find({**tscope, "status": {"$ne": "Completed"}}).sort("due_date", 1).to_list(8)
    upcoming = [await enrich_task(t) for t in upcoming]

    recent = await db.clients.find(scope).sort("updated_at", -1).to_list(6)
    recent = [await enrich_client(c) for c in recent]

    return {
        "total_clients": total_clients, "active_deals": active_deals,
        "pipeline_value": pipeline_value, "won_value": won_value, "win_rate": win_rate,
        "stage_distribution": stage_dist, "upcoming_tasks": upcoming, "recent_clients": recent,
    }


@api_router.get("/stages")
async def get_stages():
    return STAGES


@api_router.get("/")
async def root():
    return {"message": "NIVI FINSERV CRM API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("assigned_to")
    await db.tasks.create_index("assigned_to")
    # seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({"email": admin_email, "password_hash": hash_password(admin_password),
                                   "name": "NIVI Admin", "role": "admin",
                                   "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info("Seeded admin %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})
    await seed_demo_data()


async def seed_demo_data():
    if await db.clients.count_documents({}) > 0:
        return
    admin = await db.users.find_one({"role": "admin"})
    admin_id = str(admin["_id"]) if admin else None
    # demo employee
    emp = await db.users.find_one({"email": "sarah@nivifinserv.com"})
    if not emp:
        res = await db.users.insert_one({
            "name": "Sarah Jenkins", "email": "sarah@nivifinserv.com",
            "password_hash": hash_password("Employee@2026"), "role": "employee",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        emp_id = str(res.inserted_id)
    else:
        emp_id = str(emp["_id"])

    now = datetime.now(timezone.utc)
    demo = [
        ("Rahul Mehta", "rahul@brightcorp.in", "Bright Corp", "Proposal", 450000, admin_id),
        ("Anita Sharma", "anita@finwise.in", "FinWise Ltd", "Negotiation", 780000, admin_id),
        ("Vikram Singh", "vikram@nova.in", "Nova Traders", "Closed Won", 320000, emp_id),
        ("Priya Nair", "priya@zenith.in", "Zenith Group", "Lead", 150000, emp_id),
        ("Karan Patel", "karan@apex.in", "Apex Solutions", "Contacted", 260000, admin_id),
        ("Meera Iyer", "meera@summit.in", "Summit Advisors", "Closed Lost", 90000, emp_id),
    ]
    for name, email, company, stage, val, owner in demo:
        await db.clients.insert_one({
            "id": str(uuid.uuid4()), "name": name, "email": email, "phone": "+91 98765 43210",
            "company": company, "notes": "Imported demo record.", "stage": stage,
            "deal_value": float(val), "assigned_to": owner, "created_by": admin_id,
            "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
    tasks = [
        ("Send revised proposal to Bright Corp", "High", "Pending", admin_id, 2),
        ("Follow-up call with FinWise Ltd", "High", "In Progress", admin_id, 1),
        ("Prepare KYC docs for Zenith Group", "Medium", "Pending", emp_id, 3),
    ]
    for title, prio, status, owner, days in tasks:
        await db.tasks.insert_one({
            "id": str(uuid.uuid4()), "title": title, "description": "", "priority": prio,
            "status": status, "client_id": None, "assigned_to": owner, "created_by": admin_id,
            "due_date": (now + timedelta(days=days)).date().isoformat(),
            "created_at": now.isoformat(),
        })
    logger.info("Seeded demo CRM data")


@app.on_event("shutdown")
async def shutdown():
    client.close()

"""NIVI FINSERV CRM backend API tests."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://data-secure-10.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "finservnivi@gmail.com", "password": "Nivi@Admin2026"}
EMP = {"email": "sarah@nivifinserv.com", "password": "Employee@2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def emp_token():
    return _login(EMP)


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Auth ----------
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json=ADMIN)
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "admin"
        assert d["token"]

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@y.com", "password": "bad"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_ok(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=h(admin_token))
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN["email"]


# ---------- Dashboard scoping ----------
class TestDashboard:
    def test_admin_sees_all(self, admin_token):
        r = requests.get(f"{API}/dashboard/stats", headers=h(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert d["total_clients"] >= 6
        assert "stage_distribution" in d and "recent_clients" in d

    def test_employee_scoped(self, emp_token):
        r = requests.get(f"{API}/dashboard/stats", headers=h(emp_token))
        assert r.status_code == 200
        d = r.json()
        # Sarah has 3 seeded clients
        assert d["total_clients"] == 3


# ---------- Clients scoping ----------
class TestClientsScoping:
    def test_admin_sees_all_clients(self, admin_token):
        r = requests.get(f"{API}/clients", headers=h(admin_token))
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_employee_sees_only_assigned(self, emp_token):
        r = requests.get(f"{API}/clients", headers=h(emp_token))
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        assert names == {"Vikram Singh", "Priya Nair", "Meera Iyer"}

    def test_employee_cannot_access_others_client(self, admin_token, emp_token):
        r = requests.get(f"{API}/clients", headers=h(admin_token))
        others = [c for c in r.json() if c["assignee_name"] != "Sarah Jenkins"]
        assert others
        cid = others[0]["id"]
        r2 = requests.get(f"{API}/clients/{cid}", headers=h(emp_token))
        assert r2.status_code == 404

    def test_search_and_stage_filter(self, admin_token):
        r = requests.get(f"{API}/clients?q=Rahul", headers=h(admin_token))
        assert r.status_code == 200
        assert any("Rahul" in c["name"] for c in r.json())
        r2 = requests.get(f"{API}/clients?stage=Proposal", headers=h(admin_token))
        assert r2.status_code == 200
        assert all(c["stage"] == "Proposal" for c in r2.json())


# ---------- Client CRUD ----------
class TestClientCRUD:
    created_id = None

    def test_admin_create_edit_stage_delete(self, admin_token, emp_token):
        # get emp id
        r = requests.get(f"{API}/employees", headers=h(admin_token))
        assert r.status_code == 200
        emp_id = next(e["id"] for e in r.json() if e["email"] == EMP["email"])

        payload = {"name": f"TEST_Client_{uuid.uuid4().hex[:6]}", "email": "t@t.in",
                   "company": "TestCo", "stage": "Lead", "deal_value": 12345,
                   "assigned_to": emp_id}
        r = requests.post(f"{API}/clients", json=payload, headers=h(admin_token))
        assert r.status_code == 200
        c = r.json()
        cid = c["id"]
        assert c["assigned_to"] == emp_id

        # employee should see it
        r = requests.get(f"{API}/clients/{cid}", headers=h(emp_token))
        assert r.status_code == 200

        # edit stage
        payload["stage"] = "Negotiation"
        r = requests.put(f"{API}/clients/{cid}", json=payload, headers=h(admin_token))
        assert r.status_code == 200
        assert r.json()["stage"] == "Negotiation"

        # verify persistence
        r = requests.get(f"{API}/clients/{cid}", headers=h(admin_token))
        assert r.json()["stage"] == "Negotiation"

        # delete
        r = requests.delete(f"{API}/clients/{cid}", headers=h(admin_token))
        assert r.status_code == 200
        r = requests.get(f"{API}/clients/{cid}", headers=h(admin_token))
        assert r.status_code == 404

    def test_employee_create_auto_assigns_self(self, emp_token):
        payload = {"name": f"TEST_EmpClient_{uuid.uuid4().hex[:6]}", "stage": "Lead",
                   "deal_value": 500, "assigned_to": None}
        r = requests.post(f"{API}/clients", json=payload, headers=h(emp_token))
        assert r.status_code == 200
        c = r.json()
        me = requests.get(f"{API}/auth/me", headers=h(emp_token)).json()
        assert c["assigned_to"] == me["id"]
        requests.delete(f"{API}/clients/{c['id']}", headers=h(emp_token))


# ---------- Employees (admin only) ----------
class TestEmployees:
    def test_employee_cannot_create_employee(self, emp_token):
        r = requests.post(f"{API}/employees",
                          json={"name": "x", "email": "x@x.in", "password": "p"},
                          headers=h(emp_token))
        assert r.status_code == 403

    def test_admin_create_and_delete_employee(self, admin_token):
        email = f"test_{uuid.uuid4().hex[:6]}@nivifinserv.com"
        r = requests.post(f"{API}/employees",
                          json={"name": "TEST Emp", "email": email, "password": "Pass@2026"},
                          headers=h(admin_token))
        assert r.status_code == 200
        emp_id = r.json()["id"]

        # new emp can login
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass@2026"})
        assert r.status_code == 200
        new_tok = r.json()["token"]

        # assign a client, then delete emp, verify unassigned
        c = requests.post(f"{API}/clients",
                          json={"name": "TEST_Unassign", "stage": "Lead", "deal_value": 1,
                                "assigned_to": emp_id}, headers=h(admin_token)).json()
        r = requests.delete(f"{API}/employees/{emp_id}", headers=h(admin_token))
        assert r.status_code == 200
        got = requests.get(f"{API}/clients/{c['id']}", headers=h(admin_token)).json()
        assert got["assigned_to"] in (None, "")
        # cleanup
        requests.delete(f"{API}/clients/{c['id']}", headers=h(admin_token))

        # deleted emp cannot use old token (user missing)
        r = requests.get(f"{API}/auth/me", headers=h(new_tok))
        assert r.status_code == 401


# ---------- Tasks ----------
class TestTasks:
    def test_admin_tasks_crud_and_scope(self, admin_token, emp_token):
        r = requests.post(f"{API}/tasks",
                          json={"title": "TEST_task", "priority": "High", "status": "Pending"},
                          headers=h(admin_token))
        assert r.status_code == 200
        tid = r.json()["id"]

        # employee should NOT see admin's task
        r = requests.get(f"{API}/tasks", headers=h(emp_token))
        ids = [t["id"] for t in r.json()]
        assert tid not in ids

        # employee cannot update/delete admin task
        r = requests.put(f"{API}/tasks/{tid}",
                         json={"title": "hack", "priority": "Low", "status": "Completed"},
                         headers=h(emp_token))
        assert r.status_code == 404

        # toggle complete
        r = requests.put(f"{API}/tasks/{tid}",
                         json={"title": "TEST_task", "priority": "High", "status": "Completed"},
                         headers=h(admin_token))
        assert r.status_code == 200
        assert r.json()["status"] == "Completed"

        # filter
        r = requests.get(f"{API}/tasks?status=Completed", headers=h(admin_token))
        assert all(t["status"] == "Completed" for t in r.json())

        # delete
        r = requests.delete(f"{API}/tasks/{tid}", headers=h(admin_token))
        assert r.status_code == 200


# ---------- Auth guards ----------
class TestAuthGuards:
    @pytest.mark.parametrize("path", ["/clients", "/tasks", "/employees", "/dashboard/stats"])
    def test_requires_auth(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401

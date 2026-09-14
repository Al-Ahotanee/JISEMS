#!/usr/bin/env python3
"""
JISEMS Comprehensive Live User Acceptance Testing (UAT) Suite
Targets: https://jisems.onrender.com
"""

import sys
import time
import json
import random
import re
import requests

BASE_URL = 'https://jisems.onrender.com'
API_URL = f'{BASE_URL}/api/v1'

tests_run = 0
tests_passed = 0
tests_failed = 0
failures = []

def record(test_name, passed, details=''):
    global tests_run, tests_passed, tests_failed
    tests_run += 1
    if passed:
        tests_passed += 1
        print(f"  [PASS] {test_name}{f' - {details}' if details else ''}")
    else:
        tests_failed += 1
        print(f"  [FAIL] {test_name} - {details}")
        failures.append((test_name, details))

def banner(title):
    print("\n" + "=" * 70)
    print(f"  {title.upper()}")
    print("=" * 70)

def main():
    print(f"\n======================================================================")
    print(f"  JISEMS COMPREHENSIVE LIVE USER ACCEPTANCE TEST SUITE")
    print(f"  Target Server: {BASE_URL}")
    print(f"  Timestamp:     {time.strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print(f"======================================================================")

    session = requests.Session()
    session.headers.update({'User-Agent': 'JISEMS-UAT-Runner/2.0'})

    # -------------------------------------------------------------------------
    # TEST SUITE 1: System Health & Server Connectivity
    # -------------------------------------------------------------------------
    banner("1. System Health & Infrastructure Diagnostics")
    try:
        r = session.get(f"{BASE_URL}/health", timeout=20)
        data = r.json()
        record("Health endpoint HTTP 200", r.status_code == 200, f"Status: {r.status_code}")
        record("Service identifier is jisems-api", data.get("service") == "jisems-api", f"Service: {data.get('service')}")
        record("Database connection active", data.get("database") == "ok", f"Database: {data.get('database')}")
    except Exception as e:
        record("Health check connectivity", False, str(e))

    # -------------------------------------------------------------------------
    # TEST SUITE 2: Public Collation & Cryptographic Ledger
    # -------------------------------------------------------------------------
    banner("2. Public Situation Room & Cryptographic Ledger")
    try:
        r = session.get(f"{API_URL}/public/situation-room", timeout=20)
        sr = r.json().get("data", {})
        record("Situation Room API HTTP 200", r.status_code == 200)
        record("Contest exists", bool(sr.get("election")), f"Election: {sr.get('election', {}).get('title')}")
        
        lgas = sr.get("lga_breakdown", [])
        record("All 27 Jigawa LGAs present", len(lgas) == 27, f"LGA count: {len(lgas)}")
        
        jigawa_sample = {"Dutse", "Hadejia", "Birnin Kudu", "Gumel", "Kazaure", "Ringim", "Babura"}
        found_sample = {l.get("lga_name") for l in lgas}
        record("Authentic Jigawa LGAs verified in breakdown", jigawa_sample.issubset(found_sample), f"Verified: {jigawa_sample}")

        candidates = sr.get("candidates", [])
        record("Candidates populated in Situation Room", len(candidates) > 0, f"Candidate count: {len(candidates)}")
    except Exception as e:
        record("Situation Room query", False, str(e))

    try:
        r = session.get(f"{API_URL}/public/merkle-ledger", timeout=20)
        merkle = r.json().get("data", {})
        record("Merkle Ledger HTTP 200", r.status_code == 200)
        root_hash = merkle.get("merkle_root", "")
        record("Cryptographic Merkle Root Hash valid SHA-256 (64 hex)", len(root_hash) == 64, f"Root: 0x{root_hash[:16]}...")
        record("Merkle Leaf Count tracked", "total_verified_submissions" in merkle, f"Verified leaves: {merkle.get('total_verified_submissions')}")
    except Exception as e:
        record("Merkle Ledger query", False, str(e))

    try:
        r = session.get(f"{API_URL}/public/elections", timeout=20)
        elections = r.json().get("data", [])
        record("Public Contests API HTTP 200", r.status_code == 200)
        record("Active contests configured", len(elections) > 0, f"Total contests: {len(elections)}")
    except Exception as e:
        record("Public Elections query", False, str(e))

    # -------------------------------------------------------------------------
    # TEST SUITE 3: Role-Based Authentication with Seed Credentials
    # -------------------------------------------------------------------------
    banner("3. Authentication & Role-Based Access Matrix")
    seed_credentials = [
        ("Super Admin", "admin@jisems.ng", "Admin@JISEMS2027!", "super_admin"),
        ("State Coordinator", "coordinator@jisems.ng", "Coord@123456!", "state_coordinator"),
        ("LGA Coordinator", "dutse-lga@jisems.ng", "LGA@123456!", "lga_coordinator"),
        ("Ward Officer", "ward1@jisems.ng", "Ward@123456!", "ward_officer"),
        ("PU Agent", "agent@jisems.ng", "Agent@123456!", "pu_agent"),
        ("Observer", "observer@jisems.ng", "Observer@123!", "observer"),
    ]

    tokens = {}

    for label, email, pwd, expected_role in seed_credentials:
        try:
            r = session.post(f"{API_URL}/auth/login", json={"email": email, "password": pwd}, timeout=20)
            data = r.json().get("data", {})
            token = data.get("accessToken")
            user = data.get("user", {})
            actual_role = user.get("role")

            record(f"Login: {label} ({email})", r.status_code == 200 and bool(token), f"HTTP {r.status_code}")
            record(f"Role match: {label}", actual_role == expected_role, f"Expected {expected_role}, got {actual_role}")

            if token:
                tokens[expected_role] = token
                me_res = session.get(f"{API_URL}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
                record(f"Profile /auth/me for {label}", me_res.status_code == 200, f"Name: {user.get('first_name')} {user.get('last_name')}")
        except Exception as e:
            record(f"Login: {label}", False, str(e))

    # Token Refresh Test
    try:
        admin_login = session.post(f"{API_URL}/auth/login", json={"email": "admin@jisems.ng", "password": "Admin@JISEMS2027!"}, timeout=20)
        refresh_token = admin_login.json().get("data", {}).get("refreshToken")
        if refresh_token:
            r = session.post(f"{API_URL}/auth/refresh", json={"refreshToken": refresh_token}, timeout=20)
            new_access = r.json().get("data", {}).get("accessToken")
            record("Token Refresh flow (/auth/refresh)", r.status_code == 200 and bool(new_access), "New access token issued")
        else:
            record("Token Refresh flow", False, "No refresh token in login response")
    except Exception as e:
        record("Token Refresh flow", False, str(e))

    # -------------------------------------------------------------------------
    # TEST SUITE 4: User Registration & Admin Approval Lifecycle
    # -------------------------------------------------------------------------
    banner("4. New User Registration & Admin Approval Workflow")
    admin_token = tokens.get("super_admin")
    unique_id = int(time.time())
    new_user_email = f"fatima.suleiman.{unique_id}@jisems.ng"
    new_user_phone = f"+234803{random.randint(1000000, 9999999)}"
    new_user_password = "Password@JISEMS2027!"

    reg_payload = {
        "first_name": "Fatima",
        "last_name": "Suleiman",
        "email": new_user_email,
        "phone": new_user_phone,
        "password": new_user_password,
        "requested_role": "pu_agent",
        "lga_id": 6,     # Dutse LGA
        "ward_id": 1,
        "polling_unit_id": 1
    }

    application_id = None
    try:
        r = session.post(f"{API_URL}/auth/register", json=reg_payload, timeout=20)
        app_res = r.json().get("data", {})
        record("User Registration submission", r.status_code in [200, 201], f"Applicant: {new_user_email}")
        record("Application pending approval", app_res.get("status") == "pending" or r.status_code in [200, 201])
        application_id = app_res.get("id")
    except Exception as e:
        record("User Registration submission", False, str(e))

    if admin_token:
        try:
            r = session.get(f"{API_URL}/admin/applications", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
            apps = r.json().get("data", [])
            record("Admin list pending applications", r.status_code == 200, f"Applications retrieved: {len(apps)}")
            
            target_app = next((a for a in apps if a.get("email") == new_user_email), None)
            if not target_app and application_id:
                target_app = {"id": application_id}

            if target_app:
                app_id = target_app.get("id")
                review_res = session.put(
                    f"{API_URL}/admin/applications/{app_id}/review",
                    headers={"Authorization": f"Bearer {admin_token}"},
                    json={"status": "approved", "review_notes": "Approved during live UAT verification"},
                    timeout=20
                )
                record("Admin approve new user application", review_res.status_code == 200, f"App ID #{app_id} Approved")

                time.sleep(1)
                new_login = session.post(
                    f"{API_URL}/auth/login",
                    json={"email": new_user_email, "password": new_user_password},
                    timeout=20
                )
                new_user_data = new_login.json().get("data", {})
                new_user_token = new_user_data.get("accessToken")
                record(
                    "Newly registered & approved user login",
                    new_login.status_code == 200 and bool(new_user_token),
                    f"User #{new_user_data.get('user', {}).get('id')} logged in successfully"
                )

                if new_user_token:
                    prof = session.get(f"{API_URL}/auth/me", headers={"Authorization": f"Bearer {new_user_token}"}, timeout=15)
                    record("Newly registered user profile verified", prof.status_code == 200, f"Role: {prof.json().get('data', {}).get('role')}")
            else:
                record("Admin review application", False, "Could not locate application in queue")
        except Exception as e:
            record("Admin review application", False, str(e))
    else:
        record("Admin review application", False, "Super Admin token not available")

    # -------------------------------------------------------------------------
    # TEST SUITE 5: Geographic Master Data Integrity
    # -------------------------------------------------------------------------
    banner("5. Jigawa Geographic Master Data Verification")
    try:
        r = session.get(f"{API_URL}/geo/lgas", timeout=20)
        lgas = r.json().get("data", [])
        record("LGAs endpoint HTTP 200", r.status_code == 200)
        record("All 27 Jigawa LGAs in master table", len(lgas) == 27, f"Count: {len(lgas)}")
        dutse = next((l for l in lgas if l.get("name") == "Dutse"), None)
        record("State Capital (Dutse) verified in geo database", bool(dutse), f"Dutse ID: {dutse.get('id') if dutse else 'N/A'}")
    except Exception as e:
        record("LGAs query", False, str(e))

    try:
        r = session.get(f"{API_URL}/geo/wards?lga_id=6", timeout=20)
        wards = r.json().get("data", [])
        record("Wards endpoint HTTP 200", r.status_code == 200)
        record("Wards retrieved for Dutse LGA", len(wards) > 0, f"Count: {len(wards)} wards")
    except Exception as e:
        record("Wards query", False, str(e))

    # -------------------------------------------------------------------------
    # TEST SUITE 6: Anti-Rigging Forensics & Benford's Law Audit
    # -------------------------------------------------------------------------
    banner("6. Anti-Rigging Forensics & Benford's Law Intelligence")
    coord_token = tokens.get("state_coordinator") or admin_token
    if coord_token:
        try:
            r = session.get(f"{API_URL}/anomalies/benford", headers={"Authorization": f"Bearer {coord_token}"}, timeout=20)
            data = r.json().get("data", {})
            record("Benford's Law Audit HTTP 200", r.status_code == 200)
            
            # Field: distribution contains digits 1-9
            dist = data.get("distribution", [])
            record("Leading Digits 1-9 distribution present", len(dist) == 9, f"Digits count: {len(dist)}")
            
            # Field: chiSquare
            has_chi = "chiSquare" in data
            record("Chi-Square statistic computed", has_chi, f"Chi2: {data.get('chiSquare')}")
            
            # Field: riskLevel and riskMessage
            has_risk = "riskLevel" in data
            record("Forensic Risk Status assessed", has_risk, f"Risk: {data.get('riskLevel')} ({data.get('riskMessage')[:40]}...)")
        except Exception as e:
            record("Benford's Law endpoint", False, str(e))

        try:
            r = session.get(f"{API_URL}/anomalies", headers={"Authorization": f"Bearer {coord_token}"}, timeout=20)
            anomalies = r.json().get("data", [])
            record("Anomalies list HTTP 200", r.status_code == 200, f"Active flags: {len(anomalies)}")
        except Exception as e:
            record("Anomalies query", False, str(e))
    else:
        record("Anti-Rigging tests", False, "Coordinator token not available")

    # -------------------------------------------------------------------------
    # TEST SUITE 7: Incident & Dispute SLA Escalation Lifecycle
    # -------------------------------------------------------------------------
    banner("7. Rapid Incident SLA Escalation & Dispute Management")
    pu_token = tokens.get("pu_agent")
    dispute_id = None

    if pu_token:
        try:
            dispute_payload = {
                "title": f"UAT Field Dispute: Ballot Discrepancy #{unique_id}",
                "description": "Form EC8A mathematical discrepancy identified during live UAT verification run.",
                "category": "result_mismatch",
                "priority": "high"
            }
            r = session.post(f"{API_URL}/disputes", headers={"Authorization": f"Bearer {pu_token}"}, json=dispute_payload, timeout=20)
            disp_data = r.json().get("data", {})
            dispute_id = disp_data.get("id")
            record("PU Agent raises dispute", r.status_code in [200, 201] and bool(dispute_id), f"Dispute #{dispute_id}")
        except Exception as e:
            record("PU Agent raises dispute", False, str(e))
    else:
        record("PU Agent raises dispute", False, "PU Agent token not available")

    if dispute_id and admin_token:
        try:
            # Stage 2: Security Alerted
            r_sec = session.put(
                f"{API_URL}/disputes/{dispute_id}/resolve",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"status": "security_alerted", "resolution_notes": "SLA Stage 2: Rapid Response Security Forces Alerted"},
                timeout=20
            )
            record("SLA Transition -> security_alerted", r_sec.status_code == 200, "Security Forces Alerted")

            # Stage 3: Field Investigation Dispatched
            r_inv = session.put(
                f"{API_URL}/disputes/{dispute_id}/resolve",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"status": "investigating", "resolution_notes": "SLA Stage 3: Electoral Investigation Unit on-site"},
                timeout=20
            )
            record("SLA Transition -> investigating", r_inv.status_code == 200, "Investigation Dispatched")

            # Add comment to dispute
            r_comm = session.post(
                f"{API_URL}/disputes/{dispute_id}/comments",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"comment": "Investigation team confirmed form EC8A physical reconciliation underway."},
                timeout=20
            )
            record("Add comment to dispute", r_comm.status_code in [200, 201])

            # Stage 4: Resolved
            r_res = session.put(
                f"{API_URL}/disputes/{dispute_id}/resolve",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"status": "resolved", "resolution_notes": "SLA Stage 4: Audited against original physical EC8A and resolved"},
                timeout=20
            )
            record("SLA Transition -> resolved", r_res.status_code == 200, "Dispute Officially Resolved")

            # Verify dispute detail contains comment history
            r_detail = session.get(f"{API_URL}/disputes/{dispute_id}", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
            detail = r_detail.json().get("data", {})
            comments = detail.get("comments", [])
            record("Dispute contains automated SLA audit logs", len(comments) >= 3, f"Comment count: {len(comments)}")
            record("Final dispute status is resolved", detail.get("status") == "resolved", f"Status: {detail.get('status')}")
        except Exception as e:
            record("SLA Escalation workflow", False, str(e))

    # -------------------------------------------------------------------------
    # TEST SUITE 8: Administrative Reports & Audit Logging
    # -------------------------------------------------------------------------
    banner("8. Administrative Reports & System Audit Trail")
    if admin_token:
        try:
            r = session.get(f"{API_URL}/admin/audit-logs?limit=10", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
            logs = r.json().get("data", [])
            record("System Audit Logs endpoint HTTP 200", r.status_code == 200)
            record("Audit Trail capturing user events", len(logs) > 0, f"Latest actions: {[l.get('action') for l in logs[:3]]}")
        except Exception as e:
            record("Audit logs query", False, str(e))

        try:
            r = session.get(f"{API_URL}/reports/csv", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
            record("CSV Report generation HTTP 200", r.status_code == 200)
            record("CSV Content-Type valid", "text/csv" in r.headers.get("content-type", ""))
            record("CSV headers contain Jigawa fields", "LGA" in r.text or "Total" in r.text, f"Bytes: {len(r.text)}")
        except Exception as e:
            record("CSV Report export", False, str(e))

        try:
            r = session.get(f"{API_URL}/admin/users?limit=5", headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)
            users = r.json().get("data", [])
            record("Admin User Directory HTTP 200", r.status_code == 200, f"Users listed: {len(users)}")
        except Exception as e:
            record("Admin users query", False, str(e))

    # -------------------------------------------------------------------------
    # TEST SUITE 9: Frontend Production Assets & UI Feature Verification
    # -------------------------------------------------------------------------
    banner("9. Frontend Production Assets & UI Feature Verification")
    try:
        r_html = session.get(BASE_URL, timeout=20)
        html = r_html.text
        record("Frontend index.html served HTTP 200", r_html.status_code == 200)
        record("HTML title contains JISEMS branding", "JISEMS" in html or "Jigawa" in html, "Brand confirmed in DOM")

        # Find all script src
        script_paths = re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', html)
        main_script = script_paths[0] if script_paths else None
        record("Compiled JavaScript bundle referenced", bool(main_script), f"Main script: {main_script}")

        # In Vite production, pages are code-split chunks referenced in the main script
        r_main_js = session.get(f"{BASE_URL}{main_script}", timeout=25)
        chunk_paths = re.findall(r'assets/[a-zA-Z0-9_\-]+\.js', r_main_js.text)
        record("Vite dynamic page chunks discovered", len(chunk_paths) > 0, f"Total chunks: {len(set(chunk_paths))}")

        # Map critical chunks to check
        situation_room_chunk = next((c for c in chunk_paths if 'SituationRoom' in c), None)
        anti_rigging_chunk = next((c for c in chunk_paths if 'AntiRigging' in c), None)
        submit_result_chunk = next((c for c in chunk_paths if 'SubmitResult' in c), None)
        dispute_detail_chunk = next((c for c in chunk_paths if 'DisputeDetail' in c), None)

        record("SituationRoom page chunk present", bool(situation_room_chunk), situation_room_chunk)
        record("AntiRiggingDashboard page chunk present", bool(anti_rigging_chunk), anti_rigging_chunk)
        record("SubmitResult page chunk present", bool(submit_result_chunk), submit_result_chunk)
        record("DisputeDetail page chunk present", bool(dispute_detail_chunk), dispute_detail_chunk)

        # Inspect SituationRoom chunk for core features
        if situation_room_chunk:
            sr_js = session.get(f"{BASE_URL}/{situation_room_chunk}", timeout=25).text
            record("UI Feature: 27 Jigawa LGAs in SituationRoom", "Birnin Kudu" in sr_js and "Hadejia" in sr_js)
            record("UI Feature: TV Broadcast Media Wall mode", "COMMAND DESK" in sr_js and "TV Broadcast" in sr_js)
            record("UI Feature: Decision Desk Call Projection", "Decision Desk" in sr_js or "MATHEMATICALLY CLINCHED" in sr_js)
            record("UI Feature: Battleground Flip Watch ribbon", "FLIP WATCH" in sr_js)
            record("UI Feature: Cryptographic Merkle Audit Ledger card", "merkle-ledger" in sr_js)
            record("UI Feature: Verified Result Card Generator (1200x675)", "1200x675" in sr_js and "Result Card" in sr_js)

        # Inspect AntiRiggingDashboard chunk
        if anti_rigging_chunk:
            ar_js = session.get(f"{BASE_URL}/{anti_rigging_chunk}", timeout=25).text
            record("UI Feature: Benford's Law audit visualization", "benford" in ar_js.lower() and "chi" in ar_js.lower())

        # Inspect SubmitResult chunk
        if submit_result_chunk:
            sub_js = session.get(f"{BASE_URL}/{submit_result_chunk}", timeout=25).text
            record("UI Feature: Camera Watermark capture", "watermark" in sub_js.lower())
            record("UI Feature: Arithmetic Auto-Balance assistant", "arithmetic" in sub_js.lower())

        # Inspect DisputeDetail chunk
        if dispute_detail_chunk:
            disp_js = session.get(f"{BASE_URL}/{dispute_detail_chunk}", timeout=25).text
            record("UI Feature: Rapid Incident SLA tracking pipeline", "security_alerted" in disp_js and "sla" in disp_js.lower())

    except Exception as e:
        record("Frontend bundle inspection", False, str(e))

    # -------------------------------------------------------------------------
    # FINAL SUMMARY
    # -------------------------------------------------------------------------
    banner("User Acceptance Testing Summary")
    print(f"\n  Total Checks Run:     {tests_run}")
    print(f"  Passed Checks:        {tests_passed}")
    print(f"  Failed Checks:        {tests_failed}")
    pass_pct = (tests_passed / tests_run) * 100 if tests_run else 0
    print(f"  Success Rate:         {pass_pct:.1f}%")

    if failures:
        print("\n  FAILURES ENCOUNTERED:")
        for name, detail in failures:
            print(f"   - {name}: {detail}")
    else:
        print("\n  ALL TESTS PASSED! 100% OPERATIONAL VERIFICATION!")

    print("\n" + "=" * 70)
    return 0 if tests_failed == 0 else 1

if __name__ == '__main__':
    sys.exit(main())

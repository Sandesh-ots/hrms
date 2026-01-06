# Copyright (c) 2025, Your Company
# For license information, please see license.txt

import frappe
from frappe.utils import getdate
from frappe import _

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    chart = get_chart_data(data)
    report_summary = get_report_summary(data)
    return columns, data, None, chart, report_summary

def get_columns():
    return [
        {"label": _("Employee"), "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 180},
        {"label": _("Employee Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 150},
        {"label": _("From Date"), "fieldname": "from_date", "fieldtype": "Date", "width": 100},
        {"label": _("To Date"), "fieldname": "to_date", "fieldtype": "Date", "width": 100},
        {"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
        {"label": _("Approver"), "fieldname": "wfh_approver", "fieldtype": "Link", "options": "Employee", "width": 150},
        {"label": _("Application ID"), "fieldname": "name", "fieldtype": "Link", "options": "Work From Home Application", "width": 150}
    ]

def get_data(filters):
    conditions = "WHERE 1=1"

    if filters.get("from_date"):
        conditions += f" AND from_date >= '{filters['from_date']}'"
    if filters.get("to_date"):
        conditions += f" AND to_date <= '{filters['to_date']}'"
    if filters.get("employee"):
        conditions += f" AND employee = '{filters['employee']}'"
    if filters.get("status"):
        conditions += f" AND status = '{filters['status']}'"
    if filters.get("wfh_approver"):
        conditions += f" AND wfh_approver = '{filters['wfh_approver']}'"

    data = frappe.db.sql(f"""
        SELECT
            name, employee, employee_name, from_date, to_date, status,
            wfh_approver
        FROM `tabWork From Home Application`
        {conditions}
        ORDER BY from_date DESC
    """, as_dict=True)

    return data

def get_chart_data(data):
    if not data:
        return None

    status_count = {}
    for row in data:
        status_count[row.status] = status_count.get(row.status, 0) + 1

    labels = list(status_count.keys())
    values = list(status_count.values())

    return {
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "name": _("Status"),
                    "values": values
                }
            ]
        },
        "type": "pie"
    }

def get_report_summary(data):
    if not data:
        return []

    summary = {}
    days_summary = {
        "Approved": 0,
        "Open": 0,
        "Revoked": 0,
        "Rejected": 0
    }

    for d in data:
        # count applications
        summary[d.status] = summary.get(d.status, 0) + 1

        # compute days (inclusive: from_date to to_date)
        if d.from_date and d.to_date:
            days = (getdate(d.to_date) - getdate(d.from_date)).days + 1
        else:
            days = 0

        # sum WFH days by status
        if d.status in days_summary:
            days_summary[d.status] += days

    colors = {
        "Approved": "Green",
        "Open": "Blue",
        "Rejected": "Red",
        "Cancelled": "Grey",
        "Revoked": "Brown"
    }

    result = [
        {
            "label": status,
            "value": count,
            "indicator": colors.get(status, "Blue"),
            "datatype": "Int"
        } for status, count in summary.items()
    ]

    # add totals for WFH days
    for status, days in days_summary.items():
        if status == "Approved":
            result.append({
            "label": f"Total WFH Days Availed",
            "value": days,
            "indicator": colors.get(status, "Blue"),
            "datatype": "Int"
        })
        else:
            result.append({
            "label": f"Total {status} WFH Days",
            "value": days,
            "indicator": colors.get(status, "Blue"),
            "datatype": "Int"
        })

    return result


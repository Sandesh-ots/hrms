from frappe.model.document import Document
import frappe
from frappe import _
from datetime import datetime, timedelta


class WorkFromHomeApplication(Document):

    def onload(self):
        current_emp = frappe.db.get_value(
            "Employee", {"user_id": frappe.session.user}, "name"
        )
	
        not_allowed = 0
        if self.employee == current_emp:
            if (
                "WFH Approver" in frappe.get_roles(frappe.session.user)
                or "Leave Approver" in frappe.get_roles(frappe.session.user)
            ):
                not_allowed = 1
            else:
                not_allowed = 1

        self.set_onload('self_wfh_approval_not_allowed', not_allowed)
		

    def validate_for_self_approval(self):
        self_wfh_approval_not_allowed = frappe.db.get_single_value(
            "HR Settings", "prevent_self_leave_approval"
        )
        employee_user = frappe.db.get_value("Employee", self.employee, "user_id")
        if (
            self_wfh_approval_not_allowed
            and employee_user == frappe.session.user
            and not get_workflow_name("Work From Home Application")
        ):
            frappe.throw(
                _("Self-approval for Work From Home applications is not allowed")
            )

    def after_insert(self):
        self.leaves_applies_check()

        if frappe.session.user != 'Administrator':
            if isinstance(self.from_date, str):
                from_date = datetime.strptime(self.from_date, "%Y-%m-%d").date()
            else:
                from_date = self.from_date

            today = datetime.strptime(frappe.utils.today(), "%Y-%m-%d").date()
            date_diff = (from_date - today).days

            if date_diff < 7:
                frappe.throw(
                    _("You can only apply for Work From Home at least 7 days in advance.")
                )

    def before_save(self):
        doc_before_save = self.get_doc_before_save()

        # Remove previous WFH Approver's share
        if doc_before_save and doc_before_save.wfh_approver != self.wfh_approver:
            old_approver = doc_before_save.wfh_approver
            if old_approver:
                old_approver_user_id = frappe.db.get_value(
                    "Employee", old_approver, "user_id"
                )
                if old_approver_user_id:
                    frappe.share.remove(
                        self.doctype,
                        self.name,
                        old_approver_user_id,
                        flags={"ignore_permissions": True}
                    )
                    frappe.msgprint(
                        _(f"Removed sharing from previous WFH approver: {old_approver_user_id}"),
                        alert=True
                    )

        # Remove previous Reporting Manager's share
        elif doc_before_save and doc_before_save.assign_todo_task != self.assign_todo_task:
            old_manager = doc_before_save.assign_todo_task
            if old_manager:
                old_manager_user_id = frappe.db.get_value(
                    "Employee", old_manager, "user_id"
                )
                if old_manager_user_id:
                    frappe.share.remove(
                        self.doctype,
                        self.name,
                        old_manager_user_id,
                        flags={"ignore_permissions": True}
                    )
                    frappe.msgprint(
                        _(f"Removed sharing from previous reporting manager: {old_manager_user_id}"),
                        alert=True
                    )

    def share_doc_with_user(self, user):
        if not user:
            frappe.msgprint("User is None, skipping share.")
            return

        has_permission = frappe.has_permission(
            doc=self, ptype="submit", user=user
        )

        if not has_permission:
            frappe.share.add_docshare(
                self.doctype,
                self.name,
                user,
                read=1,
                write=1,
                submit=1,
                flags={"ignore_share_permission": True}
            )
            frappe.msgprint(
                f"Shared document with the user {user} with 'Submit' permission",
                alert=True
            )

    def on_submit(self):
        self.validate_for_self_approval()

    def on_update(self):
        # Leave validation
        self.leaves_applies_check()

        # Share with WFH Approver
        self.share_doc_with_user(self.wfh_approver)
        frappe.msgprint(
            _(f"Shared document with the user : {self.wfh_approver}"),
            alert=True
        )

        # Share with Reporting Manager
        if self.assign_todo_task:
            manager_id = frappe.db.get_value(
                "Employee", self.assign_todo_task, "user_id"
            )
            if manager_id:
                self.share_doc_with_user(manager_id)
                frappe.msgprint(
                    _(f"Shared document with the user : {manager_id}"),
                    alert=True
                )
            else:
                frappe.msgprint(
                    _(f"User ID not found for manager: {self.assign_todo_task}"),
                    alert=True
                )
        else:
            frappe.msgprint(_("assign_todo_task is empty"), alert=True)

        # Share with Employee
        if self.employee:
            employee_user_id = frappe.db.get_value(
                "Employee", self.employee, "user_id"
            )
            if employee_user_id and employee_user_id != frappe.session.user:
                self.share_doc_with_user(employee_user_id)
                frappe.msgprint(
                    _(f"Shared document with Employee: {employee_user_id}"),
                    alert=True
                )

        if self.flags.in_insert:
            return

        # Email to WFH Approver
        subject = f"Work From Home Application Edited by {self.employee_name}"
        message = f"""
        Dear {self.wfh_approver},<br><br>
        Work From Home Application has been edited.<br><br>
        <b>Employee:</b> {self.employee_name}<br>
        <b>From Date:</b> {self.from_date}<br>
        <b>To Date:</b> {self.to_date}<br>
        <a href="{frappe.utils.get_url()}/app/work-from-home-application/{self.name}">
        Click here to view the WFH Application</a><br><br>
        Regards,<br>
        ERPNext System
        """

        frappe.sendmail(
            recipients=[self.wfh_approver],
            subject=subject,
            message=message
        )

        # Email to Reporting Manager
        reporting_manager_email = frappe.db.get_value(
            "Employee", {"name": self.assign_todo_task}, "user_id"
        )

        message = f"""
        Dear Reporting Manager,<br><br>
        Work From Home Application has been edited.<br><br>
        <b>Employee:</b> {self.employee_name}<br>
        <b>From Date:</b> {self.from_date}<br>
        <b>To Date:</b> {self.to_date}<br>
        <a href="{frappe.utils.get_url()}/app/work-from-home-application/{self.name}">
        Click here to view the WFH Application</a><br><br>
        Regards,<br>
        ERPNext System
        """

        frappe.sendmail(
            recipients=[reporting_manager_email],
            subject=subject,
            message=message
        )

    def leaves_applies_check(self):
        leaves_applied = frappe.get_all(
            "Leave Application",
            filters={
                "employee": self.employee,
                "status": ["in", ["Approved", "Open"]]
            },
            fields=["from_date", "to_date"]
        )

        for leave in leaves_applied:
            leave_start = frappe.utils.getdate(leave.from_date)
            leave_end = frappe.utils.getdate(leave.to_date)
            wfh_start = frappe.utils.getdate(self.from_date)
            wfh_end = frappe.utils.getdate(self.to_date)

            if (wfh_start <= leave_end) and (leave_start <= wfh_end):
                frappe.throw(
                    "You already have a leave applied within this date range. "
                    "WFH cannot be applied."
                )


@frappe.whitelist()
def get_wfh_approver(employee):
    return frappe.db.get_value("Employee", employee, "reports_to")


@frappe.whitelist()
def get_number_of_wfh_days(employee, from_date, to_date):
    from frappe.utils import date_diff
    return date_diff(to_date, from_date) + 1


@frappe.whitelist()
def get_mandatory_approval(doctype):
    return True

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import append_number_if_name_exists
from frappe.utils import flt, validate_email_address
from hrms.hr.doctype.interview.interview import get_interviewers

class DuplicationError(frappe.ValidationError):
	pass

class JobApplicant(Document):
	def onload(self):
		job_offer = frappe.get_all("Job Offer", filters={"job_applicant": self.name})
		if job_offer:
			self.get("__onload").job_offer = job_offer[0].name

	def autoname(self):
		self.name = self.email_id
		if frappe.db.exists("Job Applicant", self.name):
			self.name = append_number_if_name_exists("Job Applicant", self.name)

	def validate(self):
		validate_email_address(self.email_id)
		self.check_for_duplicate()

	def check_for_duplicate(self):
		if self.is_new():
			duplicate = frappe.db.get_value("Job Applicant", {"email_id": self.email_id, "job_title": self.job_title})
			if duplicate:
				frappe.throw(_("Job Applicant with email {0} already exists for {1}").format(self.email_id, self.job_title), DuplicationError)

	def on_update(self):
		if self.status == "Open" and self.job_title:
			job_opening = frappe.get_doc("Job Opening", self.job_title)
			if job_opening.status == "Closed":
				frappe.throw(_("Job Opening {0} is closed").format(self.job_title))

@frappe.whitelist()
def get_interview_details(job_applicant):
	return frappe.get_all("Interview", filters={"job_applicant": job_applicant}, fields=["name", "interview_round", "status"])

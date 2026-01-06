frappe.ui.form.on("Work From Home Application", {

    // COMMON HELPER to hide self-approval actions
    hide_self_approval_actions(frm, self_approval_not_allowed, current_employee) {
        frappe.after_ajax(() => {
            if (frm.doc.docstatus === 0 && !frm.is_dirty()) {
                if (self_approval_not_allowed && current_employee === frm.doc.employee) {
                    // Block self-approval
                    frm.set_df_property("status", "read_only", 1);
                    frm.page.clear_primary_action();
                    frm.page.clear_secondary_action();
                    frm.page.clear_actions_menu();
                    $(frm.wrapper).find(".workflow-button").hide();
                    $(frm.wrapper).find(".actions-btn-group").hide();
                    frm.trigger("show_save_button");
                } else {
                    frappe.workflow.get_transitions(frm).then(() => {
                        frappe.workflow.setup(frm);
                    });
                }
            }
        });
    },


    setup: function (frm) {
        frm.set_query("wfh_approver", () => ({ filters: { employee: frm.doc.employee } }));
        frm.set_query("assign_todo_task", erpnext.queries.employee);
        frm.set_query("employee", erpnext.queries.employee);
    },

    async onload(frm) {
        // Auto-fill employee info if creating new doc
        if (frm.doc.__islocal && frappe.session.user !== "Administrator") {
            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: "Employee",
                    filters: { user_id: frappe.session.user },
                    fields: ["name", "employee_name"]
                },
                callback: function (res) {
                    if (res.message.length > 0) {
                        let emp = res.message[0];
                        frm.set_value("employee", emp.name);
                        frm.set_value("employee_name", emp.employee_name);
                    }
                }
            });
        }

        // Set posting date if missing
        if (!frm.doc.posting_date) {
            frm.set_value("posting_date", frappe.datetime.get_today());
        }

        frm.ignore_doctypes_on_cancel_all = ["WFH Ledger Entry"];

        // Check if WFH approver field should be required
        if (frm.doc.docstatus === 0) {
            const r = await frappe.call({
                method: "hrms.hr.doctype.work_from_home_application.work_from_home_application.get_mandatory_approval",
                args: { doctype: frm.doc.doctype },
            });
            if (r.message) {
                frm.toggle_reqd("wfh_approver", true);
            }
        }

        // RUN RESTRICTION CHECK on first load
        let self_approval_not_allowed = cint(frm.doc.__onload?.self_wfh_approval_not_allowed || 0);
        let current_employee = await hrms.get_current_employee();
        frm.events.hide_self_approval_actions(frm, self_approval_not_allowed, current_employee);
    	if (frappe.session.user === "Administrator") return;

        if (frm.is_new()) return;

        frappe.db.get_value("Employee", frm.doc.assign_todo_task, "user_id")
            .then(r => {
                let reporting_manager = r && r.message ? r.message.user_id : null;

                // Step 2: If current user is NOT reporting manager, lock form
                if (frappe.session.user !== reporting_manager) {
                    if (frm.doc.workflow_state === "Pending") {
                        frm.disable_form();   // lock entire form
                    }
                }
            });
    },

    async refresh(frm) {
        if (frm.is_new()) {
            frm.trigger("calculate_total_days");
        }

        frm.set_intro("");
        if (frm.doc.__islocal && !in_list(frappe.user_roles, "Employee")) {
            frm.set_intro(__("Fill the form and save it"));
        } else if (
            frm.perm[0] &&
            frm.perm[0].submit &&
            !frm.is_dirty() &&
            !frm.is_new() &&
            !frappe.model.has_workflow(frm.doctype) &&
            frm.doc.docstatus === 0
        ) {
            frm.set_intro(__("Submit this Work From Home Application to confirm."));
        }

        frm.trigger("set_employee");

        // RUN RESTRICTION CHECK on refresh
        let self_approval_not_allowed = cint(frm.doc.__onload?.self_wfh_approval_not_allowed || 0);
        let current_employee = await hrms.get_current_employee();
        frm.events.hide_self_approval_actions(frm, self_approval_not_allowed, current_employee);
    	if (frappe.session.user === "Administrator") return;

        if (frm.is_new()) return;

        frappe.db.get_value("Employee", frm.doc.assign_todo_task, "user_id")
            .then(r => {
                let reporting_manager = r && r.message ? r.message.user_id : null;

                // Step 2: If current user is NOT reporting manager, lock form
                if (frappe.session.user !== reporting_manager) {
                    if (frm.doc.workflow_state === "Pending") {
                        frm.disable_form();   // lock entire form
                    }
                }
            });
    },

    async set_employee(frm) {
        if (frm.doc.employee) return;
        const employee = await hrms.get_current_employee(frm);
        if (employee) {
            frm.set_value("employee", employee);
        }
    },

    employee: function (frm) {
        frm.trigger("make_dashboard");
        frm.trigger("set_wfh_approver");
    },

    from_date: function (frm) {
        frm.trigger("validate_from_to_date");
        frm.trigger("calculate_total_days");
    },

    to_date: function (frm) {
        frm.trigger("validate_from_to_date");
        frm.trigger("calculate_total_days");
    },

    validate_from_to_date: function (frm) {
        if (!frm.doc.from_date || !frm.doc.to_date) return;
        const from_date = Date.parse(frm.doc.from_date);
        const to_date = Date.parse(frm.doc.to_date);

        if (to_date < from_date) {
            frm.set_value("to_date", frm.doc.from_date);
            frappe.show_alert({
                message: __("Changing 'To Date' to match 'From Date'."),
                indicator: "blue",
            });
        }
    },

    calculate_total_days: function (frm) {
        if (frm.doc.from_date && frm.doc.to_date) {
            frappe.call({
                method: "hrms.hr.doctype.work_from_home_application.work_from_home_application.get_number_of_wfh_days",
                args: {
                    employee: frm.doc.employee,
                    from_date: frm.doc.from_date,
                    to_date: frm.doc.to_date,
                },
                callback: function (r) {
                    if (r && r.message) {
                        frm.set_value("total_wfh_days", r.message);
                    }
                },
            });
        }
    },

    set_wfh_approver: function (frm) {
        if (frm.doc.employee) {
            frappe.call({
                method: "hrms.hr.doctype.work_from_home_application.work_from_home_application.get_wfh_approver",
                args: { employee: frm.doc.employee },
                callback: function (r) {
                    if (r && r.message) {
                        frm.set_value("wfh_approver", r.message);
                    }
                },
            });
        }
    }
});

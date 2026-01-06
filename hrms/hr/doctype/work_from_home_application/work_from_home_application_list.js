frappe.listview_settings['Work From Home Application'] = {
    onload: function (listview) {
        // Optional: log all visible WFH apps
        console.log("Work From Home List loaded", listview);
    },

    // Optional: handle custom row click (override)
    get_indicator: function (doc) {
        // Optional: color-coded status indicator
        if (doc.status === "Approved") {
            return [__("Approved"), "green", "status,=,Approved"];
        } else if (doc.status === "Rejected") {
            return [__("Rejected"), "red", "status,=,Rejected"];
        } else if (doc.status === "Revoked") {
            return [__("Revoked"), "orange", "status,=,Revoked"];
        } else {
            return [__("Pending"), "gray", "status,=,Pending"];
        }
    }
};

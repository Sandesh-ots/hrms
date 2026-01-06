// Copyright (c) 2019, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Employee Checkin", {
	onload: async function (frm) {
    	function onPositionRecieved(position){
	        var longitude= position.coords.longitude;
	        var latitude= position.coords.latitude;
	        frm.set_value('longitude',longitude);
	        frm.set_value('latitude',latitude);
	        console.log(longitude);
	        console.log(latitude);
	        fetch('https://api.opencagedata.com/geocode/v1/json?q='+latitude+'+'+longitude+'&key=de1bf3be66b546b89645e500ec3a3a28')
	         .then(response => response.json())
            .then(data => {
                var city=data['results'][0].components.city;
                var state=data['results'][0].components.state;
                var components=data['results'][0].components;
                var area=components.residential || components.suburb || components.neighbourhood || components.village || "";
                frm.set_value('custom_city',city);
                frm.set_value('custom_state',state);
                frm.set_value('custom_area',area);
                console.log(data);
            })
            .catch(err => console.log(err));
	        frm.set_df_property('my_location','options','<div class="mapouter"><div class="gmap_canvas"><iframe width=100% height="300" id="gmap_canvas" src="https://maps.google.com/maps?q='+latitude+','+longitude+'&t=&z=17&ie=UTF8&iwloc=&output=embed" frameborder="0" scrolling="no" marginheight="0" marginwidth="0"></iframe><a href="https://yt2.org/youtube-to-mp3-ALeKk00qEW0sxByTDSpzaRvl8WxdMAeMytQ1611842368056QMMlSYKLwAsWUsAfLipqwCA2ahUKEwiikKDe5L7uAhVFCuwKHUuFBoYQ8tMDegUAQCSAQCYAQCqAQdnd3Mtd2l6"></a><br><style>.mapouter{position:relative;text-align:right;height:300px;width:100%;}</style><style>.gmap_canvas {overflow:hidden;background:none!important;height:300px;width:100%;}</style></div></div>');
            frm.refresh_field('my_location');
	    }
	    
	    function locationNotRecieved(positionError){
	        console.log(positionError);
	    }
	    
	    if(frm.doc.longitude && frm.doc.latitude){
	        frm.set_df_property('my_location','options','<div class="mapouter"><div class="gmap_canvas"><iframe width=100% height="300" id="gmap_canvas" src="https://maps.google.com/maps?q='+frm.doc.latitude+','+frm.doc.longitude+'&t=&z=17&ie=UTF8&iwloc=&output=embed" frameborder="0" scrolling="no" marginheight="0" marginwidth="0"></iframe><a href="https://yt2.org/youtube-to-mp3-ALeKk00qEW0sxByTDSpzaRvl8WxdMAeMytQ1611842368056QMMlSYKLwAsWUsAfLipqwCA2ahUKEwiikKDe5L7uAhVFCuwKHUuFBoYQ8tMDegUAQCSAQCYAQCqAQdnd3Mtd2l6"></a><br><style>.mapouter{position:relative;text-align:right;height:300px;width:100%;}</style><style>.gmap_canvas {overflow:hidden;background:none!important;height:300px;width:100%;}</style></div></div>');
            frm.refresh_field('my_location');
	    } else {
	        if(navigator.geolocation){
	            navigator.geolocation.getCurrentPosition(onPositionRecieved,locationNotRecieved,{ enableHighAccuracy: true});
	        }
	    }
		if (!frm.doc.employee) {
			const res = await frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Employee",
					filters: {
						user_id: frappe.session.user
					},
					fields: ["name"]
				}
			});

			if (res.message && res.message.length > 0) {
				frm.set_value("employee", res.message[0].name);
			}
		}
	},
	refresh: async (frm) => {
		if (frm.doc.offshift) {
			frm.dashboard.clear_headline();
			frm.dashboard.set_headline(
				__(
					"This check-in is outside assigned shift hours and will not be considered for attendance. If a shift is assigned, adjust its time window and Fetch Shift again.",
				),
			);
		}
		if (!frm.doc.__islocal) frm.trigger("add_fetch_shift_button");

		const allow_geolocation_tracking = await frappe.db.get_single_value(
			"HR Settings",
			"allow_geolocation_tracking",
		);

		if (!allow_geolocation_tracking) {
			hide_field(["fetch_geolocation", "latitude", "longitude", "geolocation"]);
			return;
		}
	},

	fetch_geolocation: (frm) => {
		hrms.fetch_geolocation(frm);
	},

	add_fetch_shift_button(frm) {
		if (frm.doc.attendance) return;
		frm.add_custom_button(__("Fetch Shift"), function () {
			frappe.call({
				method: "fetch_shift",
				doc: frm.doc,
				freeze: true,
				freeze_message: __("Fetching Shift"),
				callback: function () {
					if (frm.doc.shift) {
						frappe.show_alert({
							message: __("Shift has been successfully updated to {0}.", [
								frm.doc.shift,
							]),
							indicator: "green",
						});
						frm.dirty();
						frm.save();
					} else {
						frappe.show_alert({
							message: __("No valid shift found for log time"),
							indicator: "orange",
						});
					}
				},
			});
		});
	},
});

use tauri::{Runtime, WebviewWindow};

pub fn register<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    {
        register_linux(window)?;
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = window;
    }

    Ok(())
}

#[cfg(target_os = "linux")]
fn register_linux<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    use gtk::gdk::{Atom, EventMask, EventType};
    use gtk::glib;
    use gtk::prelude::*;

    let gtk_window = window.gtk_window()?;
    let net_wm_state = Atom::intern("_NET_WM_STATE");
    let maximized_vert = Atom::intern("_NET_WM_STATE_MAXIMIZED_VERT");
    let maximized_horz = Atom::intern("_NET_WM_STATE_MAXIMIZED_HORZ");

    if let Some(gdk_window) = gtk_window.window() {
        gdk_window.set_events(gdk_window.events() | EventMask::PROPERTY_CHANGE_MASK);
    }

    let gtk_for_property = gtk_window.clone();
    gtk_window.connect_event(move |_, event| {
        if event.event_type() != EventType::PropertyNotify {
            return glib::Propagation::Proceed;
        }

        let Some(prop_event) = event.downcast_ref::<gtk::gdk::EventProperty>() else {
            return glib::Propagation::Proceed;
        };

        if prop_event.atom() != net_wm_state {
            return glib::Propagation::Proceed;
        }

        let gtk_win = gtk_for_property.clone();
        glib::idle_add_local_once(move || {
            sync_full_maximize_from_wm(&gtk_win, maximized_vert, maximized_horz);
        });

        glib::Propagation::Proceed
    });

    Ok(())
}

#[cfg(target_os = "linux")]
fn sync_full_maximize_from_wm(
    gtk_window: &gtk::ApplicationWindow,
    maximized_vert: gtk::gdk::Atom,
    maximized_horz: gtk::gdk::Atom,
) {
    use gtk::prelude::*;

    let Some(gdk_window) = gtk_window.window() else {
        return;
    };

    let atoms = read_net_wm_state_atom_values(&gdk_window);
    let has_vert = atoms
        .iter()
        .any(|value| *value == maximized_vert.value());
    let has_horz = atoms
        .iter()
        .any(|value| *value == maximized_horz.value());

    // Super+Up sets both atoms. Super+Left/Right only set MAXIMIZED_HORZ — leave those to the WM.
    let wants_full_maximize = has_vert && has_horz;

    if wants_full_maximize && !gtk_window.is_maximized() {
        gtk_window.set_resizable(true);
        gtk_window.maximize();
        return;
    }

    if !has_vert && !has_horz && gtk_window.is_maximized() {
        gtk_window.unmaximize();
    }
}

#[cfg(target_os = "linux")]
fn read_net_wm_state_atom_values(gdk_window: &gtk::gdk::Window) -> Vec<usize> {
    use gtk::gdk;

    let property = gdk::Atom::intern("_NET_WM_STATE");
    let atom_type = gdk::Atom::intern("ATOM");
    let Some((_, format, data)) = gdk::property_get(gdk_window, &property, &atom_type, 0, 1024, 0)
    else {
        return Vec::new();
    };

    if format != 32 {
        return Vec::new();
    }

    data.chunks_exact(4)
        .map(|chunk| u32::from_ne_bytes(chunk.try_into().expect("atom chunk")) as usize)
        .collect()
}

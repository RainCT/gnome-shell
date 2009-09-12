/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;

const Chrome = imports.ui.chrome;
const Overview = imports.ui.overview;
const Panel = imports.ui.panel;
const RunDialog = imports.ui.runDialog;
const LookingGlass = imports.ui.lookingGlass;
const Sidebar = imports.ui.sidebar;
const Tweener = imports.ui.tweener;
const WindowManager = imports.ui.windowManager;

const DEFAULT_BACKGROUND_COLOR = new Clutter.Color();
DEFAULT_BACKGROUND_COLOR.from_pixel(0x2266bbff);

let chrome = null;
let panel = null;
let sidebar = null;
let overview = null;
let runDialog = null;
let lookingGlass = null;
let wm = null;
let recorder = null;
let inModal = false;

function start() {
    // Add a binding for "global" in the global JS namespace; (gjs
    // keeps the web browser convention of having that namespace be
    // called "window".)
    window.global = Shell.Global.get();

    Gio.DesktopAppInfo.set_desktop_env("GNOME");

    global.grab_dbus_service();

    Tweener.init();

    // Ensure ShellAppMonitor is initialized; this will
    // also initialize ShellAppSystem first.  ShellAppSystem
    // needs to load all the .desktop files, and ShellAppMonitor
    // will use those to associate with windows.  Right now
    // the Monitor doesn't listen for installed app changes
    // and recalculate application associations, so to avoid
    // races for now we initialize it here.  It's better to
    // be predictable anyways.
    Shell.AppMonitor.get_default();

    // The background color really only matters if there is no desktop
    // window (say, nautilus) running. We set it mostly so things look good
    // when we are running inside Xephyr.
    global.stage.color = DEFAULT_BACKGROUND_COLOR;

    // Mutter currently hardcodes putting "Yessir. The compositor is running""
    // in the Overview. Clear that out.
    let children = global.overlay_group.get_children();
    for (let i = 0; i < children.length; i++)
        children[i].destroy();

    global.connect('panel-run-dialog', function(panel) {
        // Make sure not more than one run dialog is shown.
        if (runDialog == null) {
            runDialog = new RunDialog.RunDialog();
        }
        runDialog.open();
    });

    overview = new Overview.Overview();
    chrome = new Chrome.Chrome();
    panel = new Panel.Panel();
    sidebar = new Sidebar.Sidebar();
    wm = new WindowManager.WindowManager();

    global.screen.connect('toggle-recording', function() {
        if (recorder == null) {
            recorder = new Shell.Recorder({ stage: global.stage });
        }

        if (recorder.is_recording()) {
            recorder.pause();
        } else {
            recorder.record();
        }
    });

    _relayout();

    panel.startupAnimation();

    let display = global.screen.get_display();
    display.connect('overlay-key', Lang.bind(overview, overview.toggle));
    global.connect('panel-main-menu', Lang.bind(overview, overview.toggle));

    global.stage.connect('captured-event', _globalKeyPressHandler);

    Mainloop.idle_add(_removeUnusedWorkspaces);
}

function _relayout() {
    panel.actor.set_size(global.screen_width, Panel.PANEL_HEIGHT);
    overview.relayout();
}

// metacity-clutter currently uses the same prefs as plain metacity,
// which probably means we'll be starting out with multiple workspaces;
// remove any unused ones. (We do this from an idle handler, because
// global.get_windows() still returns NULL at the point when start()
// is called.)
function _removeUnusedWorkspaces() {

    let windows = global.get_windows();
    let maxWorkspace = 0;
    for (let i = 0; i < windows.length; i++) {
        let win = windows[i];

        if (!win.get_meta_window().is_on_all_workspaces() &&
            win.get_workspace() > maxWorkspace) {
            maxWorkspace = win.get_workspace();
        }
    }
    let screen = global.screen;
    if (screen.n_workspaces > maxWorkspace) {
        for (let w = screen.n_workspaces - 1; w > maxWorkspace; w--) {
            let workspace = screen.get_workspace_by_index(w);
            screen.remove_workspace(workspace, 0);
        }
    }

    return false;
}

// This function encapsulates hacks to make certain global keybindings
// work even when we are in one of our modes where global keybindings
// are disabled with a global grab. (When there is a global grab, then
// all key events will be delivered to the stage, so ::captured-event
// on the stage can be used for global keybindings.)
//
// We expect to need to conditionally enable just a few keybindings
// depending on circumstance; the main hackiness here is that we are
// assuming that keybindings have their default values; really we
// should be asking Mutter to resolve the key into an action and then
// base our handling based on the action.
function _globalKeyPressHandler(actor, event) {
    if (!inModal)
        return false;

    let type = event.type();

    if (type == Clutter.EventType.KEY_PRESS) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.Print) {
            // We want to be able to take screenshots of the shell at all times
            let gconf = Shell.GConf.get_default();
            let command = gconf.get_string("/apps/metacity/keybinding_commands/command_screenshot");
            if (command != null && command != "") {
                let [ok, len, args] = GLib.shell_parse_argv(command);
                let p = new Shell.Process({'args' : args});
                p.run();
            }

            return true;
        }
    } else if (type == Clutter.EventType.KEY_RELEASE) {
        let symbol = event.get_key_symbol();
        if (symbol == Clutter.Super_L || symbol == Clutter.Super_R) {
            // The super key is the default for triggering the overview, and should
            // get us out of the overview when we are already in it.
            if (overview.visible)
                overview.hide();

            return true;
        }
    }

    return false;
}

// Used to go into a mode where all keyboard and mouse input goes to
// the stage. Returns true if we successfully grabbed the keyboard and
// went modal, false otherwise
function beginModal() {
    let timestamp = global.screen.get_display().get_current_time();

    if (!global.begin_modal(timestamp))
        return false;
    global.set_stage_input_mode(Shell.StageInputMode.FULLSCREEN);

    inModal = true;

    return true;
}

function endModal() {
    let timestamp = global.screen.get_display().get_current_time();

    global.end_modal(timestamp);
    global.set_stage_input_mode(Shell.StageInputMode.NORMAL);
    inModal = false;
}

function createLookingGlass() {
    if (lookingGlass == null) {
        lookingGlass = new LookingGlass.LookingGlass();
        lookingGlass.slaveTo(panel.actor);
    }
    return lookingGlass;
}

function createAppLaunchContext() {
    let screen = global.screen;
    let display = screen.get_display();

    let context = new Gdk.AppLaunchContext();
    context.set_timestamp(display.get_current_time());

    // Make sure that the app is opened on the current workspace even if
    // the user switches before it starts
    context.set_desktop(screen.get_active_workspace_index());

    return context;
}

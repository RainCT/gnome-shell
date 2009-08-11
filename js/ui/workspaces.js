/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const Pango = imports.gi.Pango;
const Shell = imports.gi.Shell;
const Signals = imports.signals;

const AppDisplay = imports.ui.appDisplay;
const DND = imports.ui.dnd;
const GenericDisplay = imports.ui.genericDisplay;
const Main = imports.ui.main;
const Overview = imports.ui.overview;
const Panel = imports.ui.panel;
const Tweener = imports.ui.tweener;

const FOCUS_ANIMATION_TIME = 0.15;

const WINDOWCLONE_BG_COLOR = new Clutter.Color();
WINDOWCLONE_BG_COLOR.from_pixel(0x000000f0);
const WINDOWCLONE_TITLE_COLOR = new Clutter.Color();
WINDOWCLONE_TITLE_COLOR.from_pixel(0xffffffff);
const FRAME_COLOR = new Clutter.Color();
FRAME_COLOR.from_pixel(0xffffffff);

// Define a layout scheme for small window counts. For larger
// counts we fall back to an algorithm. We need more schemes here
// unless we have a really good algorithm.

// Each triplet is [xCenter, yCenter, scale] where the scale
// is relative to the width of the workspace.
const POSITIONS = {
        1: [[0.5, 0.5, 0.95]],
        2: [[0.25, 0.5, 0.48], [0.75, 0.5, 0.48]],
        3: [[0.25, 0.25, 0.48],  [0.75, 0.25, 0.48],  [0.5, 0.75, 0.48]],
        4: [[0.25, 0.25, 0.47],   [0.75, 0.25, 0.47], [0.75, 0.75, 0.47], [0.25, 0.75, 0.47]],
        5: [[0.165, 0.25, 0.32], [0.495, 0.25, 0.32], [0.825, 0.25, 0.32], [0.25, 0.75, 0.32], [0.75, 0.75, 0.32]]
};

// Spacing between workspaces. At the moment, the same spacing is used
// in both zoomed-in and zoomed-out views; this is slightly
// metaphor-breaking, but the alternatives are also weird.
const GRID_SPACING = 15;
const FRAME_SIZE = GRID_SPACING / 3;

let buttonSize = false;

function WindowClone(realWindow) {
    this._init(realWindow);
}

WindowClone.prototype = {
    _init : function(realWindow) {
        this.actor = new Clutter.Clone({ source: realWindow.get_texture(),
                                         reactive: true,
                                         x: realWindow.x,
                                         y: realWindow.y });
        this.actor._delegate = this;
        this.realWindow = realWindow;
        this.metaWindow = realWindow.meta_window;
        this.origX = realWindow.x;
        this.origY = realWindow.y;

        this.actor.connect('button-release-event',
                           Lang.bind(this, this._onButtonRelease));

        this.actor.connect('enter-event',
                           Lang.bind(this, this._onEnter));
        this.actor.connect('leave-event',
                           Lang.bind(this, this._onLeave));
        this._havePointer = false;

        this._draggable = DND.makeDraggable(this.actor);
        this._draggable.connect('drag-begin', Lang.bind(this, this._onDragBegin));
        this._draggable.connect('drag-end', Lang.bind(this, this._onDragEnd));
        this._inDrag = false;
    },

    destroy: function () {
        this.actor.destroy();
        if (this._title)
            this._title.destroy();
    },

    _onEnter: function (actor, event) {
        // If the user drags faster than we can follow, he'll end up
        // leaving the window temporarily and then re-entering it
        if (this._inDrag)
            return;

        this._havePointer = true;

        actor.raise_top();
        this._updateTitle();
    },

    _onLeave: function (actor, event) {
        // If the user drags faster than we can follow, he'll end up
        // leaving the window temporarily and then re-entering it
        if (this._inDrag)
            return;

        this._havePointer = false;

        if (Tweener.isTweening(this.actor))
            return;

    	actor.raise(this.stackAbove);
        this._updateTitle();
    },

    _onButtonRelease : function (actor, event) {
        this.emit('selected', event.get_time());
    },

    _onDragBegin : function (draggable, time) {
        this._inDrag = true;
        this._updateTitle();
        this.emit('drag-begin');
    },

    _onDragEnd : function (draggable, time, snapback) {
        this._inDrag = false;

        // Most likely, the clone is going to move away from the
        // pointer now. But that won't cause a leave-event, so
        // do this by hand. Of course, if the window only snaps
        // back a short distance, this might be wrong, but it's
        // better to have the label mysteriously missing than
        // mysteriously present
        this._havePointer = false;

        this.emit('drag-end');
    },

    // Called by Tweener
    onAnimationStart : function () {
        this._updateTitle();
    },

    // Called by Tweener
    onAnimationComplete : function () {
        this._updateTitle();
        this.actor.raise(this.stackAbove);
    },

    _createTitle : function () {
        let window = this.realWindow;
        
        let box = new Big.Box({ background_color : WINDOWCLONE_BG_COLOR,
                                y_align: Big.BoxAlignment.CENTER,
                                corner_radius: 5,
                                padding: 4,
                                spacing: 4,
                                orientation: Big.BoxOrientation.HORIZONTAL });

        let title = new Clutter.Text({ color: WINDOWCLONE_TITLE_COLOR,
                                       font_name: "Sans 12",
                                       text: this.metaWindow.title,
                                       ellipsize: Pango.EllipsizeMode.END
                                     });
        box.append(title, Big.BoxPackFlags.EXPAND);
        // Get and cache the expected width (just the icon), with spacing, plus title
        box.fullWidth = box.width;
        box.hide(); // Hidden by default, show on mouseover
        this._title = box;        

        // Make the title a sibling of the window
        this.actor.get_parent().add_actor(box);
    },

    _adjustTitle : function () {
        let title = this._title;
        if (!title)
            return;    

        let [cloneScreenWidth, cloneScreenHeight] = this.actor.get_transformed_size();
        let [titleScreenWidth, titleScreenHeight] = title.get_transformed_size();

        // Titles are supposed to be "full-size", so adjust its
        // scale to counteract the scaling of its ancestor actors.
        title.set_scale(title.width / titleScreenWidth * title.scale_x,
                        title.height / titleScreenHeight * title.scale_y);

        title.width = Math.min(title.fullWidth, cloneScreenWidth);
        let xoff = ((cloneScreenWidth - title.width) / 2) * title.scale_x;
        title.set_position(this.actor.x + xoff, this.actor.y);
    },

    _showTitle : function () {
        if (!this._title)
            this._createTitle();

        this._adjustTitle();
        this._title.show();
        this._title.raise(this.actor);
    },

    _hideTitle : function () {
        if (!this._title)
            return;

        this._title.hide();
    },

    _updateTitle : function () {
        let shouldShow = (this._havePointer &&
                          !this._inDrag &&
                          !Tweener.isTweening(this.actor));

        if (shouldShow)
            this._showTitle();
        else
            this._hideTitle();
    }
};

Signals.addSignalMethods(WindowClone.prototype);


function DesktopClone(window) {
    this._init(window);
}

DesktopClone.prototype = {
    _init : function(window) {
        if (window) {
            this.actor = new Clutter.Clone({ source: window.get_texture(),
                                             reactive: true });
        } else {
            let global = Shell.Global.get();
            this.actor = new Clutter.Rectangle({ color: global.stage.color,
                                                 reactive: true,
                                                 width: global.screen_width,
                                                 height: global.screen_height });
        }

        this.actor.connect('button-release-event',
                           Lang.bind(this, this._onButtonRelease));
    },

    _onButtonRelease : function (actor, event) {
        this.emit('selected', event.get_time());
    }
};

Signals.addSignalMethods(DesktopClone.prototype);


/**
 * @workspaceNum: Workspace index
 * @parentActor: The actor which will be the parent of this workspace;
 *               we need this in order to add chrome such as the icons
 *               on top of the windows without having them be scaled.
 */
function Workspace(workspaceNum, parentActor) {
    this._init(workspaceNum, parentActor);
}

Workspace.prototype = {
    _init : function(workspaceNum, parentActor) {
        let me = this;
        let global = Shell.Global.get();

        this.workspaceNum = workspaceNum;
        this._metaWorkspace = global.screen.get_workspace_by_index(workspaceNum);

        this.parentActor = parentActor;

        this.actor = new Clutter.Group();
        this.actor._delegate = this;
        this.scale = 1.0;

        let windows = global.get_windows().filter(this._isMyWindow, this);

        // Find the desktop window
        for (let i = 0; i < windows.length; i++) {
            if (windows[i].get_window_type() == Meta.WindowType.DESKTOP) {
                this._desktop = new DesktopClone(windows[i]);
                break;
            }
        }
        // If there wasn't one, fake it
        if (!this._desktop)
            this._desktop = new DesktopClone();

        this._desktop.connect('selected',
                              Lang.bind(this,
                                        function(clone, time) {
                                            this._metaWorkspace.activate(time);
                                            Main.overview.hide();
                                        }));
        this.actor.add_actor(this._desktop.actor);

        // Create clones for remaining windows that should be
        // visible in the Overview
        this._windows = [this._desktop];
        this._windowIcons = [ null ];
        for (let i = 0; i < windows.length; i++) {
            if (this._isOverviewWindow(windows[i])) {
                this._addWindowClone(windows[i]);
            }
        }

        // Track window changes
        this._windowAddedId = this._metaWorkspace.connect('window-added',
                                                          Lang.bind(this, this._windowAdded));
        this._windowRemovedId = this._metaWorkspace.connect('window-removed',
                                                            Lang.bind(this, this._windowRemoved));

        this._removeButton = null;
        this._visible = false;

        this._frame = null;

        this.leavingOverview = false;
    },

    updateRemovable : function() {
        let global = Shell.Global.get();
        let removable = (this._windows.length == 1 /* just desktop */ &&
                         this.workspaceNum != 0 &&
                         this.workspaceNum == global.screen.n_workspaces - 1);

        if (removable) {
            if (this._removeButton)
                return;

            this._removeButton = new Clutter.Texture({ width: buttonSize,
                                                       height: buttonSize,
                                                       reactive: true
                                                     });
            this._removeButton.set_from_file(global.imagedir + "remove-workspace.svg");
            this._removeButton.connect('button-release-event', Lang.bind(this, this._removeSelf));

            this.actor.add_actor(this._removeButton);
            this._adjustRemoveButton();
            this._adjustRemoveButtonId = this.actor.connect('notify::scale-x', Lang.bind(this, this._adjustRemoveButton));

            if (this._visible) {
                this._removeButton.set_opacity(0);
                Tweener.addTween(this._removeButton,
                                 { opacity: 255,
                                   time: Overview.ANIMATION_TIME,
                                   transition: "easeOutQuad"
                                 });
            }
        } else {
            if (!this._removeButton)
                return;

            if (this._visible) {
                Tweener.addTween(this._removeButton,
                                 { opacity: 0,
                                   time: Overview.ANIMATION_TIME,
                                   transition: "easeOutQuad",
                                   onComplete: this._removeRemoveButton,
                                   onCompleteScope: this
                                 });
            } else
                this._removeRemoveButton();
        }
    },

    _lookupIndex: function (metaWindow) {
        let index, clone;
        for (let i = 0; i < this._windows.length; i++) {
            if (this._windows[i].metaWindow == metaWindow) {
                return i;
            }
        }
        return -1;
    },

    lookupCloneForMetaWindow: function (metaWindow) {
        let index = this._lookupIndex (metaWindow);
        return index < 0 ? null : this._windows[index];
    },

    _adjustRemoveButton : function() {
        this._removeButton.set_scale(1.0 / this.actor.scale_x,
                                     1.0 / this.actor.scale_y);
        this._removeButton.set_position(
            (this.actor.width - this._removeButton.width / this.actor.scale_x) / 2,
            (this.actor.height - this._removeButton.height / this.actor.scale_y) / 2);
    },

    _removeRemoveButton : function() {
        this._removeButton.destroy();
        this._removeButton = null;
        this.actor.disconnect(this._adjustRemoveButtonId);
    },

    // Mark the workspace selected/not-selected
    setSelected : function(selected) {
        if (selected) {
            if (this._frame)
                return;

            // FIXME: do something cooler-looking using clutter-cairo
            this._frame = new Clutter.Rectangle({ color: FRAME_COLOR });
            this.actor.add_actor(this._frame);
            this._frame.set_position(this._desktop.actor.x - FRAME_SIZE / this.actor.scale_x,
                                     this._desktop.actor.y - FRAME_SIZE / this.actor.scale_y);
            this._frame.set_size(this._desktop.actor.width + 2 * FRAME_SIZE / this.actor.scale_x,
                                 this._desktop.actor.height + 2 * FRAME_SIZE / this.actor.scale_y);
            this._frame.lower_bottom();

            this._framePosHandler = this.actor.connect('notify::scale-x', Lang.bind(this, this._updateFramePosition));
        } else {
            if (!this._frame)
                return;
            this.actor.disconnect(this._framePosHandler);
            this._frame.destroy();
            this._frame = null;
        }
    },

    _updateFramePosition : function() {
        this._frame.set_position(this._desktop.actor.x - FRAME_SIZE / this.actor.scale_x,
                                 this._desktop.actor.y - FRAME_SIZE / this.actor.scale_y);
        this._frame.set_size(this._desktop.actor.width + 2 * FRAME_SIZE / this.actor.scale_x,
                             this._desktop.actor.height + 2 * FRAME_SIZE / this.actor.scale_y);
    },

    // Reposition all windows in their zoomed-to-Overview position. if workspaceZooming
    // is true, then the workspace is moving at the same time and we need to take
    // that into account
    positionWindows : function(workspaceZooming) {
        let global = Shell.Global.get();

        for (let i = 1; i < this._windows.length; i++) {
            let clone = this._windows[i];
            let icon = this._windowIcons[i];
            clone.stackAbove = this._windows[i - 1].actor;

            let [xCenter, yCenter, fraction] = this._computeWindowPosition(i);
            xCenter = xCenter * global.screen_width;
            yCenter = yCenter * global.screen_height;

            // clone.actor.width/height aren't reliably set at this point for
            // a new window - they're only set when the window contents are
            // initially updated prior to painting.
            let cloneRect = new Meta.Rectangle();
            clone.realWindow.meta_window.get_outer_rect(cloneRect);

            let desiredWidth = global.screen_width * fraction;
            let desiredHeight = global.screen_height * fraction;
            let scale = Math.min(desiredWidth / cloneRect.width, desiredHeight / cloneRect.height, 1.0 / this.scale);

            icon.hide();
            Tweener.addTween(clone.actor, 
                             { x: xCenter - 0.5 * scale * cloneRect.width,
                               y: yCenter - 0.5 * scale * cloneRect.height,
                               scale_x: scale,
                               scale_y: scale,
                               workspace_relative: workspaceZooming ? this : null,
                               time: Overview.ANIMATION_TIME,
                               transition: "easeOutQuad",
                               onComplete: Lang.bind(this, function() {
                                  this._fadeInWindowIcon(clone, icon);
                               })
                             });
        }
    },

    _fadeInWindowIcon: function (clone, icon) {
        icon.opacity = 0;
        icon.show();
        // This is a little messy and complicated because when we
        // start the fade-in we may not have done the final positioning
        // of the workspaces. (Tweener doesn't necessarily finish
        // all animations before calling onComplete callbacks.)
        // So we need to manually compute where the window will
        // be after the workspace animation finishes.
        let [parentX, parentY] = icon.get_parent().get_position();
        let [cloneX, cloneY] = clone.actor.get_position();
        let [cloneWidth, cloneHeight] = clone.actor.get_size();
        cloneX = this.gridX + this.scale * cloneX;
        cloneY = this.gridY + this.scale * cloneY;
        cloneWidth = this.scale * clone.actor.scale_x * cloneWidth;
        cloneHeight = this.scale * clone.actor.scale_y * cloneHeight;
        // Note we only round the first part, because we're still going to be
        // positioned relative to the parent.  By subtracting a possibly
        // non-integral parent X/Y we cancel it out.
        let x = Math.round(cloneX + cloneWidth - icon.width) - parentX;
        let y = Math.round(cloneY + cloneHeight - icon.height) - parentY;
        icon.set_position(x, y);
        icon.raise(this.actor);
        Tweener.addTween(icon,
                         { opacity: 255,
                           time: Overview.ANIMATION_TIME,
                           transition: "easeOutQuad" });
    },

    _fadeInAllIcons: function () {
        for (let i = 1; i < this._windows.length; i++) {
            let clone = this._windows[i];
            let icon = this._windowIcons[i];
            this._fadeInWindowIcon(clone, icon);
        }
    },

    _hideAllIcons: function () {
        for (let i = 1; i < this._windows.length; i++) {
            let icon = this._windowIcons[i];
            icon.hide();
        }
    },

    _windowRemoved : function(metaWorkspace, metaWin) {
        let global = Shell.Global.get();
        let win = metaWin.get_compositor_private();

        // find the position of the window in our list
        let index = this._lookupIndex (metaWin);

        if (index == -1)
            return;

        let clone = this._windows[index];
        let icon = this._windowIcons[index];

        this._windows.splice(index, 1);
        this._windowIcons.splice(index, 1);

        // If metaWin.get_compositor_private() returned non-NULL, that
        // means the window still exists (and is just being moved to
        // another workspace or something), so set its overviewHint
        // accordingly. (If it returned NULL, then the window is being
        // destroyed; we'd like to animate this, but it's too late at
        // this point.)
        if (win) {
            let [stageX, stageY] = clone.actor.get_transformed_position();
            let [stageWidth, stageHeight] = clone.actor.get_transformed_size();
            win._overviewHint = {
                x: stageX,
                y: stageY,
                scale: stageWidth / clone.actor.width
            };
        }
        clone.destroy();
        icon.destroy();

        this.positionWindows(false);
        this.updateRemovable();
    },

    _windowAdded : function(metaWorkspace, metaWin) {
        if (this.leavingOverview)
            return;

        let win = metaWin.get_compositor_private();

        if (!win) {
            // Newly-created windows are added to a workspace before
            // the compositor finds out about them...
            Mainloop.idle_add(Lang.bind(this,
                                        function () {
                                            if (this.actor && metaWin.get_compositor_private())
                                                this._windowAdded(metaWorkspace, metaWin);
                                            return false;
                                        }));
            return;
        }
        
        if (!this._isOverviewWindow(win))
            return;        

        let clone = this._addWindowClone(win);

        if (win._overviewHint) {
            let x = (win._overviewHint.x - this.actor.x) / this.scale;
            let y = (win._overviewHint.y - this.actor.y) / this.scale;
            let scale = win._overviewHint.scale / this.scale;
            delete win._overviewHint;

            clone.actor.set_position (x, y);
            clone.actor.set_scale (scale, scale);
        }

        this.positionWindows(false);
        this.updateRemovable();
    },

    // Animate the full-screen to Overview transition.
    zoomToOverview : function() {
        this.actor.set_position(this.gridX, this.gridY);
        this.actor.set_scale(this.scale, this.scale);

        // Position and scale the windows.
        this.positionWindows(true);

        // Fade in the remove button if available, so that it doesn't appear
        // too abrubtly and doesn't start at a too big size.
        if (this._removeButton) {
            Tweener.removeTweens(this._removeButton);
            this._removeButton.opacity = 0;
            Tweener.addTween(this._removeButton,
                             { opacity: 255,
                               time: Overview.ANIMATION_TIME,
                               transition: 'easeOutQuad'
                             });
        }

        this._visible = true;
    },

    // Animates the return from Overview mode
    zoomFromOverview : function() {
        this.leavingOverview = true;

        this._hideAllIcons();

        Main.overview.connect('hidden', Lang.bind(this,
                                                 this._doneLeavingOverview));

        // Fade out the remove button if available, so that it doesn't
        // disappear too abrubtly and doesn't become too big.
        if (this._removeButton) {
            Tweener.removeTweens(this._removeButton);
            Tweener.addTween(this._removeButton,
                             { opacity: 0,
                               time: Overview.ANIMATION_TIME,
                               transition: 'easeOutQuad'
                             });
        }

        // Position and scale the windows.
        for (let i = 1; i < this._windows.length; i++) {
            let clone = this._windows[i];
            Tweener.addTween(clone.actor,
                             { x: clone.origX,
                               y: clone.origY,
                               scale_x: 1.0,
                               scale_y: 1.0,
                               workspace_relative: this,
                               time: Overview.ANIMATION_TIME,
                               opacity: 255,
                               transition: "easeOutQuad"
                             });
        }

        this._visible = false;        
    },

    // Animates grid shrinking/expanding when a row or column
    // of workspaces is added or removed
    resizeToGrid : function (oldScale) {
        this._hideAllIcons();
        Tweener.addTween(this.actor,
                         { x: this.gridX,
                           y: this.gridY,
                           scale_x: this.scale,
                           scale_y: this.scale,
                           time: Overview.ANIMATION_TIME,
                           transition: "easeOutQuad",
                           onComplete: Lang.bind(this, this._fadeInAllIcons)
                         });
    },

    // Animates the addition of a new (empty) workspace
    slideIn : function(oldScale) {
        let global = Shell.Global.get();

        if (this.gridCol > this.gridRow) {
            this.actor.set_position(global.screen_width, this.gridY);
            this.actor.set_scale(oldScale, oldScale);
        } else {
            this.actor.set_position(this.gridX, global.screen_height);
            this.actor.set_scale(this.scale, this.scale);
        }
        Tweener.addTween(this.actor,
                         { x: this.gridX,
                           y: this.gridY,
                           scale_x: this.scale,
                           scale_y: this.scale,
                           time: Overview.ANIMATION_TIME,
                           transition: "easeOutQuad"
                         });

        this._visible = true;
    },
    
    // Animates the removal of a workspace
    slideOut : function(onComplete) {
        let global = Shell.Global.get();
        let destX = this.actor.x, destY = this.actor.y;

        this._hideAllIcons();

        if (this.gridCol > this.gridRow)
            destX = global.screen_width;
        else
            destY = global.screen_height;
        Tweener.addTween(this.actor,
                         { x: destX,
                           y: destY,
                           scale_x: this.scale,
                           scale_y: this.scale,
                           time: Overview.ANIMATION_TIME,
                           transition: "easeOutQuad",
                           onComplete: onComplete
                         });

        this._visible = false;

        // Don't let the user try to select this workspace as it's
        // making its exit.
        this._desktop.reactive = false;
    },
    
    destroy : function() {
        let global = Shell.Global.get();

        Tweener.removeTweens(this.actor);
        this.actor.destroy();
        this.actor = null;

        this._metaWorkspace.disconnect(this._windowAddedId);
        this._metaWorkspace.disconnect(this._windowRemovedId);
    },

    // Sets this.leavingOverview flag to false.
    _doneLeavingOverview : function() {
        this.leavingOverview = false;
    },

    // Tests if @win belongs to this workspaces
    _isMyWindow : function (win) {
        return win.get_workspace() == this.workspaceNum ||
            (win.get_meta_window() && win.get_meta_window().is_on_all_workspaces());
    },

    // Tests if @win should be shown in the Overview
    _isOverviewWindow : function (win) {
        let wintype = win.get_window_type();
        if (wintype == Meta.WindowType.DESKTOP || 
            wintype == Meta.WindowType.DOCK)
            return false;
        return !win.is_override_redirect();
    },

    _createWindowIcon: function(window) {
        let appSys = Shell.AppSystem.get_default();
        let appMon = Shell.AppMonitor.get_default()
        let appInfo = appMon.get_window_app(window.metaWindow);
        let iconTexture = null;
        // The design is application based, so prefer the application
        // icon here if we have it.  FIXME - should move this fallback code
        // into ShellAppMonitor.
        if (appInfo) {
            iconTexture = appInfo.create_icon_texture(48);
        } else {
            let icon = window.metaWindow.icon;
            iconTexture = new Clutter.Texture({ width: 48,
                                                height: 48,
                                                keep_aspect_ratio: true });
            Shell.clutter_texture_set_from_pixbuf(iconTexture, icon);
        }
        return iconTexture;
    },

    // Create a clone of a (non-desktop) window and add it to the window list
    _addWindowClone : function(win) {
        let icon = this._createWindowIcon(win);
        this.parentActor.add_actor(icon);

        let clone = new WindowClone(win);
        clone.connect('selected',
                      Lang.bind(this, this._onCloneSelected));
        clone.connect('drag-begin',
                      Lang.bind(this, function() {
                          icon.hide();
                      }));
        clone.connect('drag-end',
                      Lang.bind(this, function() {
                          icon.show();
                      }));

        this.actor.add_actor(clone.actor);

        this._windows.push(clone);
        this._windowIcons.push(icon);

        return clone;
    },

    _computeWindowPosition : function(index) {
        // ignore this._windows[0], which is the desktop
        let windowIndex = index - 1;
        let numberOfWindows = this._windows.length - 1;

        if (numberOfWindows in POSITIONS)
            return POSITIONS[numberOfWindows][windowIndex];

        // If we don't have a predefined scheme for this window count,
        // arrange the windows in a grid pattern.
        let gridWidth = Math.ceil(Math.sqrt(numberOfWindows));
        let gridHeight = Math.ceil(numberOfWindows / gridWidth);

        let fraction = 0.95 * (1. / gridWidth);

        let xCenter = (.5 / gridWidth) + ((windowIndex) % gridWidth) / gridWidth;
        let yCenter = (.5 / gridHeight) + Math.floor((windowIndex / gridWidth)) / gridHeight;

        return [xCenter, yCenter, fraction];
    },

    _onCloneSelected : function (clone, time) {
        Main.overview.activateWindow(clone.metaWindow, time);
    },

    _removeSelf : function(actor, event) {
        let global = Shell.Global.get();
        let screen = global.screen;
        let workspace = screen.get_workspace_by_index(this.workspaceNum);

        screen.remove_workspace(workspace, event.get_time());
        return true;
    },

    // Draggable target interface
    acceptDrop : function(source, actor, x, y, time) {
        let global = Shell.Global.get();

        if (source instanceof WindowClone) {
            let win = source.realWindow;
            if (this._isMyWindow(win))
                return false;

            // Set a hint on the Mutter.Window so its initial position
            // in the new workspace will be correct
            win._overviewHint = {
                x: actor.x,
                y: actor.y,
                scale: actor.scale_x
            };

            let metaWindow = win.get_meta_window();
            metaWindow.change_workspace_by_index(this.workspaceNum,
                                                 false, // don't create workspace
                                                 time);
            return true;
        } else if (source instanceof GenericDisplay.GenericDisplayItem || source instanceof AppDisplay.WellDisplayItem) {
            this._metaWorkspace.activate(time);
            source.launch();
            return true;
        }

        return false;
    }
};

Signals.addSignalMethods(Workspace.prototype);

function Workspaces(width, height, x, y, addButtonSize, addButtonX, addButtonY) {
    this._init(width, height, x, y, addButtonSize, addButtonX, addButtonY);
}

Workspaces.prototype = {
    _init : function(width, height, x, y, addButtonSize, addButtonX, addButtonY) {
        let global = Shell.Global.get();

        this.actor = new Clutter.Group();

        let screenHeight = global.screen_height;
          
        this._width = width;
        this._height = height;
        this._x = x;
        this._y = y;

        this._workspaces = [];
        
        let activeWorkspaceIndex = global.screen.get_active_workspace_index();
        let activeWorkspace;

        // Create and position workspace objects
        for (let w = 0; w < global.screen.n_workspaces; w++) {
            this._addWorkspaceActor(w);
            if (w == activeWorkspaceIndex) {
                activeWorkspace = this._workspaces[w];
                activeWorkspace.setSelected(true);
            }
        }
        activeWorkspace.actor.raise_top();
        this._positionWorkspaces(global, activeWorkspace);

        // Create (+) button
        buttonSize = addButtonSize;
        this.addButton = new Clutter.Texture({ x: addButtonX,
                                                y: addButtonY,
                                                width: buttonSize,
                                                height: buttonSize,
                                                reactive: true
                                              });
        this.addButton.set_from_file(global.imagedir + "add-workspace.svg");
        this.addButton.connect('button-release-event', this._appendNewWorkspace);
        this.actor.add_actor(this.addButton);
        this.addButton.lower_bottom();

        let lastWorkspace = this._workspaces[this._workspaces.length - 1];
        lastWorkspace.updateRemovable(true);

        // Position/scale the desktop windows and their children after the
        // workspaces have been created. This cannot be done first because
        // window movement depends on the Workspaces object being accessible
        // as an Overview member.
        Main.overview.connect('showing',
                             Lang.bind(this, function() {
            for (let w = 0; w < this._workspaces.length; w++)
                this._workspaces[w].zoomToOverview();
        }));

        // Track changes to the number of workspaces
        this._nWorkspacesNotifyId =
            global.screen.connect('notify::n-workspaces',
                                  Lang.bind(this, this._workspacesChanged));
        this._switchWorkspaceNotifyId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._activeWorkspaceChanged));
    },

    _lookupCloneForMetaWindow: function (metaWindow) {
        for (let i = 0; i < this._workspaces.length; i++) {
            let clone = this._workspaces[i].lookupCloneForMetaWindow(metaWindow);
            if (clone)
                return clone;
        }
        return null;
    },

    // Should only be called from active Overview context
    activateWindowFromOverview: function (metaWindow, time) {
        let global = Shell.Global.get();
        let activeWorkspaceNum = global.screen.get_active_workspace_index();
        let windowWorkspaceNum = metaWindow.get_workspace().index();

        let clone = this._lookupCloneForMetaWindow (metaWindow);
        clone.actor.raise_top();

        if (windowWorkspaceNum != activeWorkspaceNum) {
            let workspace = global.screen.get_workspace_by_index(windowWorkspaceNum);
            workspace.activate_with_focus(metaWindow, time);
        } else {
            metaWindow.activate(time);
        }
    },

    hide : function() {
        let global = Shell.Global.get();
        let activeWorkspaceIndex = global.screen.get_active_workspace_index();
        let activeWorkspace = this._workspaces[activeWorkspaceIndex];

        this._positionWorkspaces(global, activeWorkspace);
        activeWorkspace.actor.raise_top();

        for (let w = 0; w < this._workspaces.length; w++)
            this._workspaces[w].zoomFromOverview();
    },

    destroy : function() {
        let global = Shell.Global.get();

        for (let w = 0; w < this._workspaces.length; w++)
            this._workspaces[w].destroy();
        this._workspaces = [];

        this.actor.destroy();
        this.actor = null;

        global.screen.disconnect(this._nWorkspacesNotifyId);
        global.window_manager.disconnect(this._switchWorkspaceNotifyId);
    },

    getScale : function() {
        return this._workspaces[0].scale;
    },

    // Get the grid position of the active workspace.
    getActiveWorkspacePosition : function() {
        let global = Shell.Global.get();
        let activeWorkspaceIndex = global.screen.get_active_workspace_index();
        let activeWorkspace = this._workspaces[activeWorkspaceIndex];

        return [activeWorkspace.gridX, activeWorkspace.gridY];
    },

    // Assign grid positions to workspaces. We can't just do a simple
    // row-major or column-major numbering, because we don't want the
    // existing workspaces to get rearranged when we add a row or
    // column. So we alternate between adding to rows and adding to
    // columns. (So, eg, when going from a 2x2 grid of 4 workspaces to
    // a 3x2 grid of 5 workspaces, the 4 existing workspaces stay
    // where they are, and the 5th one is added to the end of the
    // first row.)
    //
    // FIXME: need to make the metacity internal layout agree with this!
    _positionWorkspaces : function(global, activeWorkspace) {
        if (!activeWorkspace) {
            let activeWorkspaceIndex = global.screen.get_active_workspace_index();
            activeWorkspace = this._workspaces[activeWorkspaceIndex];
        }

        let gridWidth = Math.ceil(Math.sqrt(this._workspaces.length));
        let gridHeight = Math.ceil(this._workspaces.length / gridWidth);

        let wsWidth = (this._width - (gridWidth - 1) * GRID_SPACING) / gridWidth;
        let wsHeight = (this._height - (gridHeight - 1) * GRID_SPACING) / gridHeight;
        let scale = wsWidth / global.screen_width;

        let span = 1, n = 0, row = 0, col = 0, horiz = true;

        for (let w = 0; w < this._workspaces.length; w++) {
            let workspace = this._workspaces[w];

            workspace.gridRow = row;
            workspace.gridCol = col;

            workspace.gridX = this._x + workspace.gridCol * (wsWidth + GRID_SPACING);
            workspace.gridY = this._y + workspace.gridRow * (wsHeight + GRID_SPACING);
            workspace.scale = scale;

            if (horiz) {
                col++;
                if (col == span) {
                    row = 0;
                    horiz = false;
                }
            } else {
                row++;
                if (row == span) {
                    col = 0;
                    horiz = true;
                    span++;
                }
            }
        }
    },

    _workspacesChanged : function() {
        let global = Shell.Global.get();

        let oldNumWorkspaces = this._workspaces.length;
        let newNumWorkspaces = global.screen.n_workspaces;

        if (oldNumWorkspaces == newNumWorkspaces)
            return;

        let oldScale = this._workspaces[0].scale;
        let oldGridWidth = Math.ceil(Math.sqrt(oldNumWorkspaces));
        let oldGridHeight = Math.ceil(oldNumWorkspaces / oldGridWidth);
        let lostWorkspaces = [];

        // The old last workspace is no longer removable.
        this._workspaces[oldNumWorkspaces - 1].updateRemovable();

        if (newNumWorkspaces > oldNumWorkspaces) {
            // Create new workspace groups
            for (let w = oldNumWorkspaces; w < newNumWorkspaces; w++) {
                this._addWorkspaceActor(w);
            }

        } else {
            // Truncate the list of workspaces
            // FIXME: assumes that the workspaces are being removed from
            // the end of the list, not the start/middle
            lostWorkspaces = this._workspaces.splice(newNumWorkspaces);
        }

        // The new last workspace may be removable
        let newLastWorkspace = this._workspaces[this._workspaces.length - 1];
        newLastWorkspace.updateRemovable();

        // Figure out the new layout
        this._positionWorkspaces(global);
        let newScale = this._workspaces[0].scale;
        let newGridWidth = Math.ceil(Math.sqrt(newNumWorkspaces));
        let newGridHeight = Math.ceil(newNumWorkspaces / newGridWidth);

        if (newGridWidth != oldGridWidth || newGridHeight != oldGridHeight) {
            // We need to resize/move the existing workspaces/windows
            let existingWorkspaces = Math.min(oldNumWorkspaces, newNumWorkspaces);
            for (let w = 0; w < existingWorkspaces; w++)
                this._workspaces[w].resizeToGrid(oldScale);
        }

        if (newScale != oldScale) {
            // The workspace scale affects window size/positioning because we clamp
            // window size to a 1:1 ratio and never scale them up
            let existingWorkspaces = Math.min(oldNumWorkspaces, newNumWorkspaces);
            for (let w = 0; w < existingWorkspaces; w++)
                this._workspaces[w].positionWindows(false);
        }

        if (newNumWorkspaces > oldNumWorkspaces) {
            // Slide new workspaces in from offscreen
            for (let w = oldNumWorkspaces; w < newNumWorkspaces; w++)
                this._workspaces[w].slideIn(oldScale);
        } else {
            // Slide old workspaces out
            for (let w = 0; w < lostWorkspaces.length; w++) {
                let workspace = lostWorkspaces[w];
                workspace.slideOut(function () { workspace.destroy(); });
            }

            // FIXME: deal with windows on the lost workspaces
        }
    },

    _activeWorkspaceChanged : function(wm, from, to, direction) {
        this._workspaces[from].setSelected(false);
        this._workspaces[to].setSelected(true);
    },

    _addWorkspaceActor : function(workspaceNum) {
        let workspace  = new Workspace(workspaceNum, this.actor);
        this._workspaces[workspaceNum] = workspace;
        this.actor.add_actor(workspace.actor);
    },

    _appendNewWorkspace : function(actor, event) {
        let global = Shell.Global.get();

        global.screen.append_new_workspace(false, event.get_time());
    }
};

// Create a SpecialPropertyModifier to let us move windows in a
// straight line on the screen even though their containing workspace
// is also moving.
Tweener.registerSpecialPropertyModifier("workspace_relative", _workspaceRelativeModifier, _workspaceRelativeGet);

function _workspaceRelativeModifier(workspace) {
    let [startX, startY] = Main.overview.getPosition();
    let overviewPosX, overviewPosY, overviewScale;

    if (!workspace)
        return [];

    if (workspace.leavingOverview) {
        let [zoomedInX, zoomedInY] = Main.overview.getZoomedInPosition();
        overviewPosX = { begin: startX, end: zoomedInX };
        overviewPosY = { begin: startY, end: zoomedInY };
        overviewScale = { begin: Main.overview.getScale(),
                          end: Main.overview.getZoomedInScale() };
    } else {
        overviewPosX = { begin: startX, end: 0 };
        overviewPosY = { begin: startY, end: 0 };
        overviewScale = { begin: Main.overview.getScale(), end: 1 };
    }

    return [ { name: "x",
               parameters: { workspacePos: workspace.gridX,
                             overviewPos: overviewPosX,
                             overviewScale: overviewScale } },
             { name: "y",
               parameters: { workspacePos: workspace.gridY,
                             overviewPos: overviewPosY,
                             overviewScale: overviewScale } }
           ];
}

function _workspaceRelativeGet(begin, end, time, params) {
    let curOverviewPos = (1 - time) * params.overviewPos.begin +
                         time * params.overviewPos.end;
    let curOverviewScale = (1 - time) * params.overviewScale.begin +
                           time * params.overviewScale.end;

    // Calculate the screen position of the window.
    let screen = (1 - time) *
                 ((begin + params.workspacePos) * params.overviewScale.begin +
                  params.overviewPos.begin) +
                 time *
                 ((end + params.workspacePos) * params.overviewScale.end +
                 params.overviewPos.end);

    // Return the workspace coordinates.
    return (screen - curOverviewPos) / curOverviewScale - params.workspacePos;
}

/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Mainloop = imports.mainloop;
const Pango = imports.gi.Pango;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const Lang = imports.lang;
const Gettext = imports.gettext.domain('gnome-shell');
const _ = Gettext.gettext;

const AppDisplay = imports.ui.appDisplay;
const DocDisplay = imports.ui.docDisplay;
const Places = imports.ui.places;
const GenericDisplay = imports.ui.genericDisplay;
const Button = imports.ui.button;
const Main = imports.ui.main;

const DEFAULT_PADDING = 4;
const DEFAULT_SPACING = 4;
const DASH_SECTION_PADDING = 6;
const DASH_SECTION_SPACING = 40;
const DASH_CORNER_RADIUS = 5;
const DASH_PADDING_SIDE = 14;

const BACKGROUND_COLOR = new Clutter.Color();
BACKGROUND_COLOR.from_pixel(0x000000c0);

const PRELIGHT_COLOR = new Clutter.Color();
PRELIGHT_COLOR.from_pixel(0x4f6fadaa);

const TEXT_COLOR = new Clutter.Color();
TEXT_COLOR.from_pixel(0x5f5f5fff);
const BRIGHTER_TEXT_COLOR = new Clutter.Color();
BRIGHTER_TEXT_COLOR.from_pixel(0xbbbbbbff);
const BRIGHT_TEXT_COLOR = new Clutter.Color();
BRIGHT_TEXT_COLOR.from_pixel(0xffffffff);
const SEARCH_TEXT_COLOR = new Clutter.Color();
SEARCH_TEXT_COLOR.from_pixel(0x333333ff);

const SEARCH_CURSOR_COLOR = BRIGHT_TEXT_COLOR;
const HIGHLIGHTED_SEARCH_CURSOR_COLOR = SEARCH_TEXT_COLOR;

const HIGHLIGHTED_SEARCH_BACKGROUND_COLOR = new Clutter.Color();
HIGHLIGHTED_SEARCH_BACKGROUND_COLOR.from_pixel(0xc4c4c4ff);

const SEARCH_BORDER_BOTTOM_COLOR = new Clutter.Color();
SEARCH_BORDER_BOTTOM_COLOR.from_pixel(0x191919ff);

const SECTION_BORDER_COLOR = new Clutter.Color();
SECTION_BORDER_COLOR.from_pixel(0x262626ff);
const SECTION_BORDER = 1;
const SECTION_INNER_BORDER_COLOR = new Clutter.Color();
SECTION_INNER_BORDER_COLOR.from_pixel(0x000000ff);
const SECTION_BACKGROUND_TOP_COLOR = new Clutter.Color();
SECTION_BACKGROUND_TOP_COLOR.from_pixel(0x161616ff);
const SECTION_BACKGROUND_BOTTOM_COLOR = new Clutter.Color();
SECTION_BACKGROUND_BOTTOM_COLOR.from_pixel(0x000000ff);
const SECTION_INNER_SPACING = 8;

const BROWSE_ACTIVATED_BG = new Clutter.Color();
BROWSE_ACTIVATED_BG.from_pixel(0x303030f0);

const PANE_BORDER_COLOR = new Clutter.Color();
PANE_BORDER_COLOR.from_pixel(0x101d3cfa);
const PANE_BORDER_WIDTH = 2;

const PANE_BACKGROUND_COLOR = new Clutter.Color();
PANE_BACKGROUND_COLOR.from_pixel(0x000000f4);

const APPS = "apps";
const PREFS = "prefs";
const DOCS = "docs";

/*
 * Returns the index in an array of a given length that is obtained
 * if the provided index is incremented by an increment and the array
 * is wrapped in if necessary.
 * 
 * index: prior index, expects 0 <= index < length
 * increment: the change in index, expects abs(increment) <= length
 * length: the length of the array
 */
function _getIndexWrapped(index, increment, length) {
   return (index + increment + length) % length;
}

function _createDisplay(displayType) {
    if (displayType == APPS)
        return new AppDisplay.AppDisplay();
    else if (displayType == PREFS)
        return new AppDisplay.AppDisplay(true);
    else if (displayType == DOCS)
        return new DocDisplay.DocDisplay();

    return null;
}

function Pane() {
    this._init();
}

Pane.prototype = {
    _init: function () {
        this._open = false;

        this.actor = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                   background_color: PANE_BACKGROUND_COLOR,
                                   border: PANE_BORDER_WIDTH,
                                   border_color: PANE_BORDER_COLOR,
                                   padding: DEFAULT_PADDING,
                                   reactive: true });
        this.actor.connect('button-press-event', Lang.bind(this, function (a, e) {
            // Eat button press events so they don't go through and close the pane
            return true;
        }));

        let chromeTop = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                      spacing: 6 });

        let closeIconUri = "file://" + global.imagedir + "close.svg";
        let closeIcon = Shell.TextureCache.get_default().load_uri_sync(Shell.TextureCachePolicy.FOREVER,
                                                                       closeIconUri,
                                                                       16,
                                                                       16);
        closeIcon.reactive = true;
        closeIcon.connect('button-press-event', Lang.bind(this, function (b, e) {
            this.close();
            return true;
        }));
        chromeTop.append(closeIcon, Big.BoxPackFlags.END);
        this.actor.append(chromeTop, Big.BoxPackFlags.NONE);

        this.content = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                     spacing: DEFAULT_PADDING });
        this.actor.append(this.content, Big.BoxPackFlags.EXPAND);

        // Hidden by default
        this.actor.hide();
    },

    open: function () {
        if (this._open)
            return;
        this._open = true;
        this.actor.show();
        this.emit('open-state-changed', this._open);
    },

    close: function () {
        if (!this._open)
            return;
        this._open = false;
        this.actor.hide();
        this.emit('open-state-changed', this._open);
    },

    destroyContent: function() {
        let children = this.content.get_children();
        for (let i = 0; i < children.length; i++) {
            children[i].destroy();
        }
    },

    toggle: function () {
        if (this._open)
            this.close();
        else
            this.open();
    }
}
Signals.addSignalMethods(Pane.prototype);

function ResultArea(displayType, enableNavigation) {
    this._init(displayType, enableNavigation);
}

ResultArea.prototype = {
    _init : function(displayType, enableNavigation) {
        this.actor = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL });
        this.resultsContainer = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                              spacing: DEFAULT_PADDING
                                            });
        this.actor.append(this.resultsContainer, Big.BoxPackFlags.EXPAND);
        this.navContainer = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL });
        this.resultsContainer.append(this.navContainer, Big.BoxPackFlags.NONE);

        this.display = _createDisplay(displayType);

        this.navArea = this.display.getNavigationArea();
        if (enableNavigation && this.navArea)
            this.navContainer.append(this.navArea, Big.BoxPackFlags.EXPAND);

        this.resultsContainer.append(this.display.actor, Big.BoxPackFlags.EXPAND);

        this.controlBox = new Big.Box({ x_align: Big.BoxAlignment.CENTER });
        this.controlBox.append(this.display.displayControl, Big.BoxPackFlags.NONE);
        this.actor.append(this.controlBox, Big.BoxPackFlags.NONE);

        this.display.load();
    }
}

// Utility function shared between ResultPane and the DocDisplay in the main dash.
// Connects to the detail signal of the display, and on-demand creates a new
// pane.
function createPaneForDetails(dash, display) {
    let detailPane = null;
    display.connect('show-details', Lang.bind(this, function(display, index) {
        if (detailPane == null) {
            detailPane = new Pane();
            detailPane.connect('open-state-changed', Lang.bind(this, function (pane, isOpen) {
                if (!isOpen) {
                    /* Ensure we don't keep around large preview textures */
                    detailPane.destroyContent();
                }
            }));
            dash._addPane(detailPane);
        }

        if (index >= 0) {
            detailPane.destroyContent();
            let details = display.createDetailsForIndex(index);
            detailPane.content.append(details, Big.BoxPackFlags.EXPAND);
            detailPane.open();
        } else {
            detailPane.close();
        }
    }));
    return null;
}

function ResultPane(dash) {
    this._init(dash);
}

ResultPane.prototype = {
    __proto__: Pane.prototype,

    _init: function(dash) {
        Pane.prototype._init.call(this);
        this._dash = dash;
    },

    // Create a display of displayType and pack it into this pane's
    // content area.  Return the display.
    packResults: function(displayType, enableNavigation) {
        let resultArea = new ResultArea(displayType, enableNavigation);

        createPaneForDetails(this._dash, resultArea.display);

        this.content.append(resultArea.actor, Big.BoxPackFlags.EXPAND);
        this.connect('open-state-changed', Lang.bind(this, function(pane, isOpen) {
            resultArea.display.resetState();
        }));
        return resultArea.display;
    }
}

function SearchEntry() {
    this._init();
}

SearchEntry.prototype = {
    _init : function() {
        this.actor = new Big.Box({ padding: DEFAULT_PADDING,
                                   border_bottom: SECTION_BORDER,
                                   border_color: SEARCH_BORDER_BOTTOM_COLOR,
                                   corner_radius: DASH_CORNER_RADIUS,
                                   reactive: true });
        let box = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                y_align: Big.BoxAlignment.CENTER });
        this.actor.append(box, Big.BoxPackFlags.EXPAND);
        this.actor.connect('button-press-event', Lang.bind(this, function () {
            this._resetTextState(true);
            return false;
        }));

        this.pane = null;

        this._defaultText = _("Find...");

        let textProperties = { font_name: "Sans 16px" };
        let entryProperties = { editable: true,
                                activatable: true,
                                single_line_mode: true,
                                color: SEARCH_TEXT_COLOR,
                                cursor_color: SEARCH_CURSOR_COLOR };
        Lang.copyProperties(textProperties, entryProperties);
        this.entry = new Clutter.Text(entryProperties);

        this.entry.connect('notify::text', Lang.bind(this, function () {
            this._resetTextState(false);
        }));
        box.append(this.entry, Big.BoxPackFlags.EXPAND);

        // Mark as editable just to get a cursor
        let defaultTextProperties = { ellipsize: Pango.EllipsizeMode.END,
                                      text: this._defaultText,
                                      editable: true,
                                      color: TEXT_COLOR,
                                      cursor_visible: false,
                                      single_line_mode: true };
        Lang.copyProperties(textProperties, defaultTextProperties);
        this._defaultText = new Clutter.Text(defaultTextProperties);
        box.add_actor(this._defaultText);
        this.entry.connect('notify::allocation', Lang.bind(this, function () {
            this._repositionDefaultText();
        }));

        this._iconBox = new Big.Box({ x_align: Big.BoxAlignment.CENTER,
                                      y_align: Big.BoxAlignment.CENTER,
                                      padding_right: 4 });
        box.append(this._iconBox, Big.BoxPackFlags.END);

        let magnifierUri = "file://" + global.imagedir + "magnifier.svg";
        this._magnifierIcon = Shell.TextureCache.get_default().load_uri_sync(Shell.TextureCachePolicy.FOREVER,
                                                                             magnifierUri, 18, 18);
        let closeUri = "file://" + global.imagedir + "close-black.svg";
        this._closeIcon = Shell.TextureCache.get_default().load_uri_sync(Shell.TextureCachePolicy.FOREVER,
                                                                         closeUri, 18, 18);
        this._closeIcon.reactive = true;
        this._closeIcon.connect('button-press-event', Lang.bind(this, function () {
            // Resetting this.entry.text will trigger notify::text signal which will
            // result in this._resetTextState() being called, but we should not rely
            // on that not short-circuiting if the text was already empty, so we call
            // this._resetTextState() explicitly in that case.
            if (this.entry.text == '')
                this._resetTextState(false);
            else
                this.entry.text = '';

            // Return true to stop the signal emission, so that this.actor doesn't get 
            // the button-press-event and re-highlight itself.
            return true;
        }));
        this._repositionDefaultText();
        this._resetTextState();
    },

    setPane: function (pane) {
        this._pane = pane;
    },

    reset: function () {
        this.entry.text = '';
    },

    getText: function () {
        return this.entry.text;
    },

    _resetTextState: function (searchEntryClicked) {
        let text = this.getText();
        this._iconBox.remove_all();
        // We highlight the search box if the user starts typing in it 
        // or just clicks in it to indicate that the search is active.
        if (text != '' || searchEntryClicked) {
            if (!searchEntryClicked)
                this._defaultText.hide();
            this._iconBox.append(this._closeIcon, Big.BoxPackFlags.NONE);
            this.actor.background_color = HIGHLIGHTED_SEARCH_BACKGROUND_COLOR;
            this.entry.cursor_color = HIGHLIGHTED_SEARCH_CURSOR_COLOR;
        } else {
            this._defaultText.show();
            this._iconBox.append(this._magnifierIcon, Big.BoxPackFlags.NONE);
            this.actor.background_color = BACKGROUND_COLOR;
            this.entry.cursor_color = SEARCH_CURSOR_COLOR;
        }
    },

    _repositionDefaultText: function () {
        // Offset a little to show the cursor
        this._defaultText.set_position(this.entry.x + 4, this.entry.y);
        this._defaultText.set_size(this.entry.width, this.entry.height);
    }
};
Signals.addSignalMethods(SearchEntry.prototype);

function MoreLink() {
    this._init();
}

MoreLink.prototype = {
    _init : function () {
        this.actor = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                   padding_right: DEFAULT_PADDING,
                                   padding_left: DEFAULT_PADDING,
                                   reactive: true,
                                   x_align: Big.BoxAlignment.CENTER,
                                   y_align: Big.BoxAlignment.CENTER,
                                   border_left: SECTION_BORDER,
                                   border_color: SECTION_BORDER_COLOR });
        this.pane = null;

        let text = new Clutter.Text({ font_name: "Sans 12px",
                                      color: BRIGHT_TEXT_COLOR,
                                      text: _("Browse") });
        this.actor.append(text, Big.BoxPackFlags.NONE);

        this.actor.connect('button-press-event', Lang.bind(this, function (b, e) {
            if (this.pane == null) {
                // Ensure the pane is created; the activated handler will call setPane
                this.emit('activated');
            }
            this._pane.toggle();
            return true;
        }));
    },

    setPane: function (pane) {
        this._pane = pane;
        this._pane.connect('open-state-changed', Lang.bind(this, function(pane, isOpen) {
        }));
    }
}

Signals.addSignalMethods(MoreLink.prototype);

function BackLink() {
    this._init();
}

BackLink.prototype = {
    _init : function () {
        this.actor = new Shell.ButtonBox({ orientation: Big.BoxOrientation.HORIZONTAL,
                                           padding_right: DEFAULT_PADDING,
                                           padding_left: DEFAULT_PADDING,
                                           reactive: true,
                                           x_align: Big.BoxAlignment.CENTER,
                                           y_align: Big.BoxAlignment.CENTER,
                                           border_right: SECTION_BORDER,
                                           border_color: SECTION_BORDER_COLOR });

        let backIconUri = "file://" + global.imagedir + "back.svg";
        let backIcon = Shell.TextureCache.get_default().load_uri_sync(Shell.TextureCachePolicy.FOREVER,
                                                                      backIconUri,
                                                                      12,
                                                                      16);
        this.actor.append(backIcon, Big.BoxPackFlags.NONE);
    }
}

function SectionHeader(title, suppressBrowse) {
    this._init(title, suppressBrowse);
}

SectionHeader.prototype = {
    _init : function (title, suppressBrowse) {
        this.actor = new Big.Box({ border: SECTION_BORDER,
                                   border_color: SECTION_BORDER_COLOR });
        this._innerBox = new Big.Box({ border: SECTION_BORDER,
                                       border_color: SECTION_INNER_BORDER_COLOR,
                                       padding_left: DEFAULT_PADDING,
                                       padding_right: DEFAULT_PADDING,
                                       orientation: Big.BoxOrientation.HORIZONTAL,
                                       spacing: DEFAULT_SPACING });
        this.actor.append(this._innerBox, Big.BoxPackFlags.EXPAND);
        let backgroundGradient = Shell.create_vertical_gradient(SECTION_BACKGROUND_TOP_COLOR,
                                                                SECTION_BACKGROUND_BOTTOM_COLOR);
        this._innerBox.add_actor(backgroundGradient);
        this._innerBox.connect('notify::allocation', Lang.bind(this, function (actor) {
            let [width, height] = actor.get_size();
            backgroundGradient.set_size(width, height);
        }));

        this.backLink = new BackLink();
        this._innerBox.append(this.backLink.actor, Big.BoxPackFlags.NONE);
        this.backLink.actor.hide();

        this.backLink.actor.connect('activate', Lang.bind(this, function (actor) {
            this.emit('back-link-activated');   
        }));

        let textBox = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                    padding_top: DEFAULT_PADDING,
                                    padding_bottom: DEFAULT_PADDING });
        this.text = new Clutter.Text({ color: TEXT_COLOR,
                                       font_name: "Sans Bold 12px",
                                       text: title });
        textBox.append(this.text, Big.BoxPackFlags.NONE);

        this.countText = new Clutter.Text({ color: TEXT_COLOR,
                                            font_name: 'Sans Bold 14px' });
        textBox.append(this.countText, Big.BoxPackFlags.END);
        this.countText.hide();

        this._innerBox.append(textBox, Big.BoxPackFlags.EXPAND);

        if (!suppressBrowse) {
            this.moreLink = new MoreLink();
            this._innerBox.append(this.moreLink.actor, Big.BoxPackFlags.END);
        }
    },

    setTitle : function(title) {
        this.text.text = title;
    },

    setBackLinkVisible : function(visible) {
        if (visible)
            this.backLink.actor.show();
        else
            this.backLink.actor.hide();
    },

    setCountText : function(countText) {
        if (countText == "") {
            this.countText.hide();
        } else {
            this.countText.show();
            this.countText.text = countText;
        }
    }
}

Signals.addSignalMethods(SectionHeader.prototype);

function SearchSectionHeader(title, onClick) {
    this._init(title, onClick);
}

SearchSectionHeader.prototype = {
    _init : function(title, onClick) {
        let box = new Big.Box({ orientation: Big.BoxOrientation.HORIZONTAL,
                                padding_top: DASH_SECTION_PADDING,
                                padding_bottom: DASH_SECTION_PADDING,
                                spacing: DEFAULT_SPACING });
        let titleText = new Clutter.Text({ color: BRIGHTER_TEXT_COLOR,
                                           font_name: 'Sans Bold 12px',
                                           text: title });
        this.tooltip = new Clutter.Text({ color: BRIGHTER_TEXT_COLOR,
                                          font_name: 'Sans 12px',
                                          text: _("(see all)") });
        this.countText = new Clutter.Text({ color: BRIGHTER_TEXT_COLOR,
                                           font_name: 'Sans Bold 14px' });

        box.append(titleText, Big.BoxPackFlags.NONE);
        box.append(this.tooltip, Big.BoxPackFlags.NONE);
        box.append(this.countText, Big.BoxPackFlags.END);

        this.tooltip.hide();

        let button = new Button.Button(box, PRELIGHT_COLOR, BACKGROUND_COLOR,
                                       TEXT_COLOR);
        button.actor.height = box.height;
        button.actor.padding_left = DEFAULT_PADDING;
        button.actor.padding_right = DEFAULT_PADDING;

        button.actor.connect('activate', onClick);
        button.actor.connect('notify::hover', Lang.bind(this, this._updateTooltip));
        this.actor = button.actor;
    },

    _updateTooltip : function(actor) {
        if (actor.hover)
            this.tooltip.show();
        else
            this.tooltip.hide();
    }
}

function Section(titleString, suppressBrowse) {
    this._init(titleString, suppressBrowse);
}

Section.prototype = {
    _init: function(titleString, suppressBrowse) {
        this.actor = new Big.Box({ spacing: SECTION_INNER_SPACING });
        this.header = new SectionHeader(titleString, suppressBrowse);
        this.actor.append(this.header.actor, Big.BoxPackFlags.NONE);
        this.content = new Big.Box({spacing: SECTION_INNER_SPACING });
        this.actor.append(this.content, Big.BoxPackFlags.EXPAND);
    }
}

function Dash() {
    this._init();
}

Dash.prototype = {
    _init : function() {
        // dash and the popup panes need to be reactive so that the clicks in unoccupied places on them
        // are not passed to the transparent background underneath them. This background is used for the workspaces area when
        // the additional dash panes are being shown and it handles clicks by closing the additional panes, so that the user
        // can interact with the workspaces. However, this behavior is not desirable when the click is actually over a pane.
        //
        // We have to make the individual panes reactive instead of making the whole dash actor reactive because the width
        // of the Group actor ends up including the width of its hidden children, so we were getting a reactive object as
        // wide as the details pane that was blocking the clicks to the workspaces underneath it even when the details pane
        // was actually hidden.
        this.actor = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                   background_color: BACKGROUND_COLOR,
                                   corner_radius: DASH_CORNER_RADIUS,
                                   padding_left: DASH_PADDING_SIDE,
                                   padding_right: DASH_PADDING_SIDE,
                                   reactive: true });

        // Size for this one explicitly set from overlay.js
        this.searchArea = new Big.Box({ y_align: Big.BoxAlignment.CENTER });

        this.sectionArea = new Big.Box({ orientation: Big.BoxOrientation.VERTICAL,
                                         spacing: DASH_SECTION_SPACING });

        this.actor.append(this.searchArea, Big.BoxPackFlags.NONE);
        this.actor.append(this.sectionArea, Big.BoxPackFlags.NONE);

        // The currently active popup display
        this._activePane = null;

        /***** Search *****/

        this._searchActive = false;
        this._searchEntry = new SearchEntry();
        this.searchArea.append(this._searchEntry.actor, Big.BoxPackFlags.EXPAND);

        this._searchTimeoutId = 0;
        this._searchEntry.entry.connect('text-changed', Lang.bind(this, function (se, prop) {
            let text = this._searchEntry.getText();
            text = text.replace(/^\s+/g, "").replace(/\s+$/g, "")
            this._searchActive = text != '';
            this._updateDashActors();
            if (!this._searchActive) {
                if (this._searchTimeoutId > 0) {
                    Mainloop.source_remove(this._searchTimeoutId);
                    this._searchTimeoutId = 0;
                }
                return;
            }
            if (this._searchTimeoutId > 0)
                return;
            this._searchTimeoutId = Mainloop.timeout_add(150, Lang.bind(this, function() {
                this._searchTimeoutId = 0;
                let text = this._searchEntry.getText();
                text = text.replace(/^\s+/g, "").replace(/\s+$/g, "");

                let selectionSet = false;

                for (var i = 0; i < this._searchSections.length; i++) {
                    let section = this._searchSections[i];
                    section.resultArea.display.setSearch(text);
                    let itemCount = section.resultArea.display.getMatchedItemsCount();
                    let itemCountText = itemCount + "";
                    section.header.countText.text = itemCountText;

                    if (this._searchResultsSingleShownSection == section.type) {
                        this._searchResultsSection.header.setCountText(itemCountText);
                        if (itemCount == 0) {
                            section.resultArea.actor.hide();
                        } else {
                            section.resultArea.actor.show();
                        }
                    } else if (this._searchResultsSingleShownSection == null) {
                        // Don't show the section if it has no results
                        if (itemCount == 0) {
                            section.header.actor.hide();
                            section.resultArea.actor.hide();
                        } else {
                            section.header.actor.show();
                            section.resultArea.actor.show();
                        }
                    }

                    // Refresh the selection when a new search is applied.
                    section.resultArea.display.unsetSelected();
                    if (!selectionSet && section.resultArea.display.hasItems() &&
                        (this._searchResultsSingleShownSection == null || this._searchResultsSingleShownSection == section.type)) {
                        section.resultArea.display.selectFirstItem();
                        selectionSet = true;
                    }
                }

                return false;
            }));
        }));
        this._searchEntry.entry.connect('activate', Lang.bind(this, function (se) {
            // Only one of the displays will have an item selected, so it's ok to
            // call activateSelected() on all of them.
            for (var i = 0; i < this._searchSections.length; i++) {
                let section = this._searchSections[i];
                section.resultArea.display.activateSelected();
            }
            return true;
        }));
        this._searchEntry.entry.connect('key-press-event', Lang.bind(this, function (se, e) {
            let text = this._searchEntry.getText();
            let symbol = e.get_key_symbol();
            if (symbol == Clutter.Escape) {
                // Escape will keep clearing things back to the desktop.
                // If we are showing a particular section of search, go back to all sections.
                if (this._searchResultsSingleShownSection != null)
                    this._showAllSearchSections();
                // If we have an active search, we remove it.
                else if (this._searchActive)
                    this._searchEntry.reset();
                // Next, if we're in one of the "more" modes or showing the details pane, close them
                else if (this._activePane != null)
                    this._activePane.close();
                // Finally, just close the Overview entirely
                else
                    Main.overview.hide();
                return true;
            } else if (symbol == Clutter.Up) {
                if (!this._searchActive)
                    return true;
                // selectUp and selectDown wrap around in their respective displays
                // too, but there doesn't seem to be any flickering if we first select
                // something in one display, but then unset the selection, and move
                // it to the other display, so it's ok to do that.
                for (var i = 0; i < this._searchSections.length; i++) {
                    let section = this._searchSections[i];
                    if (section.resultArea.display.hasSelected() && !section.resultArea.display.selectUp()) {
                        if (this._searchResultsSingleShownSection != section.type) {
                            // We need to move the selection to the next section above this section that has items,
                            // wrapping around at the bottom, if necessary.
                            let newSectionIndex = this._findAnotherSectionWithItems(i, -1);
                            if (newSectionIndex >= 0) {
                                this._searchSections[newSectionIndex].resultArea.display.selectLastItem();
                                section.resultArea.display.unsetSelected();
                            }
                        }
                        break;
                    }
                }
                return true;
            } else if (symbol == Clutter.Down) {
                if (!this._searchActive)
                    return true;
                for (var i = 0; i < this._searchSections.length; i++) {
                    let section = this._searchSections[i];
                    if (section.resultArea.display.hasSelected() && !section.resultArea.display.selectDown()) {
                        if (this._searchResultsSingleShownSection != section.type) {
                            // We need to move the selection to the next section below this section that has items,
                            // wrapping around at the top, if necessary.
                            let newSectionIndex = this._findAnotherSectionWithItems(i, 1);
                            if (newSectionIndex >= 0) {
                                this._searchSections[newSectionIndex].resultArea.display.selectFirstItem();
                                section.resultArea.display.unsetSelected();
                            }
                        }
                        break;
                    }
                }
                return true;
            }
            return false;
        }));

        /***** Applications *****/

        this._appsSection = new Section(_("APPLICATIONS"));
        let appWell = new AppDisplay.AppWell();
        this._appsSection.content.append(appWell.actor, Big.BoxPackFlags.EXPAND);

        this._moreAppsPane = null;
        this._appsSection.header.moreLink.connect('activated', Lang.bind(this, function (link) {
            if (this._moreAppsPane == null) {
                this._moreAppsPane = new ResultPane(this);
                this._moreAppsPane.packResults(APPS, true);
                this._addPane(this._moreAppsPane);
                link.setPane(this._moreAppsPane);
           }
        }));

        this.sectionArea.append(this._appsSection.actor, Big.BoxPackFlags.NONE);

        /***** Places *****/

        /* Translators: This is in the sense of locations for documents,
           network locations, etc. */
        this._placesSection = new Section(_("PLACES"), true);
        let placesDisplay = new Places.Places();
        this._placesSection.content.append(placesDisplay.actor, Big.BoxPackFlags.EXPAND);
        this.sectionArea.append(this._placesSection.actor, Big.BoxPackFlags.NONE);

        /***** Documents *****/

        this._docsSection = new Section(_("RECENT DOCUMENTS"));

        let docDisplay = new DocDisplay.DashDocDisplay();
        this._docsSection.content.append(docDisplay.actor, Big.BoxPackFlags.EXPAND);

        this._moreDocsPane = null;
        this._docsSection.header.moreLink.connect('activated', Lang.bind(this, function (link) {
            if (this._moreDocsPane == null) {
                this._moreDocsPane = new ResultPane(this);
                this._moreDocsPane.packResults(DOCS, true);
                this._addPane(this._moreDocsPane);
                link.setPane(this._moreDocsPane);
           }
        }));

        this.sectionArea.append(this._docsSection.actor, Big.BoxPackFlags.EXPAND);

        /***** Search Results *****/

        this._searchResultsSection = new Section(_("SEARCH RESULTS"), true);

        this._searchResultsSingleShownSection = null;

        this._searchResultsSection.header.connect('back-link-activated', Lang.bind(this, function () {
            this._showAllSearchSections();
        }));

        this._searchSections = [
            { type: APPS,
              title: _("APPLICATIONS"),
              header: null,
              resultArea: null
            },
            { type: PREFS,
              title: _("PREFERENCES"),
              header: null,
              resultArea: null
            },
            { type: DOCS,
              title: _("RECENT DOCUMENTS"),
              header: null,
              resultArea: null
            }
        ];

        for (var i = 0; i < this._searchSections.length; i++) {
            let section = this._searchSections[i];
            section.header = new SearchSectionHeader(section.title,
                                                     Lang.bind(this,
                                                               function () {
                                                                   this._showSingleSearchSection(section.type);
                                                               }));
            this._searchResultsSection.content.append(section.header.actor, Big.BoxPackFlags.NONE);
            section.resultArea = new ResultArea(section.type, false);
            section.resultArea.controlBox.hide();
            this._searchResultsSection.content.append(section.resultArea.actor, Big.BoxPackFlags.EXPAND);
            createPaneForDetails(this, section.resultArea.display);
        }

        this.sectionArea.append(this._searchResultsSection.actor, Big.BoxPackFlags.EXPAND);
        this._searchResultsSection.actor.hide();
    },

    show: function() {
        global.stage.set_key_focus(this._searchEntry.entry);
    },

    hide: function() {
        this._firstSelectAfterOverlayShow = true;
        this._searchEntry.reset();
        if (this._activePane != null)
            this._activePane.close();
    },

    closePanes: function () {
        if (this._activePane != null)
            this._activePane.close();
    },

    _addPane: function(pane) {
        pane.connect('open-state-changed', Lang.bind(this, function (pane, isOpen) {
            if (isOpen) {
                if (pane != this._activePane && this._activePane != null) {
                    this._activePane.close();
                }
                this._activePane = pane;
            } else if (pane == this._activePane) {
                this._activePane = null;
            }
        }));
        Main.overview.addPane(pane);
    },

    _updateDashActors: function() {
        if (!this._searchActive && this._searchResultsSection.actor.visible) {
            this._showAllSearchSections();
            this._searchResultsSection.actor.hide();
            this._appsSection.actor.show();
            this._placesSection.actor.show();
            this._docsSection.actor.show();
        } else if (this._searchActive && !this._searchResultsSection.actor.visible) {
            this._searchResultsSection.actor.show();
            this._appsSection.actor.hide();
            this._placesSection.actor.hide();
            this._docsSection.actor.hide();
        }
    },

    _showSingleSearchSection: function(type) {
        // We currently don't allow going from showing one section to showing another section.
        if (this._searchResultsSingleShownSection != null) {
            throw new Error("We were already showing a single search section: '" + this._searchResultsSingleShownSection
                            + "' when _showSingleSearchSection() was called for '" + type + "'");
        }
        for (var i = 0; i < this._searchSections.length; i++) {
            let section = this._searchSections[i];
            if (section.type == type) {
                // This will be the only section shown.
                section.resultArea.display.selectFirstItem();
                section.resultArea.controlBox.show();
                let itemCount = section.resultArea.display.getMatchedItemsCount();
                let itemCountText = itemCount + "";
                section.header.actor.hide();
                this._searchResultsSection.header.setTitle(section.title);
                this._searchResultsSection.header.setBackLinkVisible(true);
                this._searchResultsSection.header.setCountText(itemCountText);
            } else {
                // We need to hide this section.
                section.header.actor.hide();
                section.resultArea.actor.hide();
                section.resultArea.display.unsetSelected();
            }
        }
        this._searchResultsSingleShownSection = type;
    },

    _showAllSearchSections: function() {
        if (this._searchResultsSingleShownSection != null) {
            let selectionSet = false;
            for (var i = 0; i < this._searchSections.length; i++) {
                let section = this._searchSections[i];
                if (section.type == this._searchResultsSingleShownSection) {
                    // This will no longer be the only section shown.
                    section.resultArea.display.displayPage(0);
                    section.resultArea.controlBox.hide();
                    let itemCount = section.resultArea.display.getMatchedItemsCount();
                    if (itemCount != 0) {
                        section.header.actor.show();
                        section.resultArea.display.selectFirstItem();
                        selectionSet = true;
                    }
                    this._searchResultsSection.header.setTitle(_("SEARCH RESULTS"));
                    this._searchResultsSection.header.setBackLinkVisible(false);
                    this._searchResultsSection.header.setCountText("");
                } else {
                    // We need to restore this section.
                    let itemCount = section.resultArea.display.getMatchedItemsCount();
                    if (itemCount != 0) {
                        section.header.actor.show();
                        section.resultArea.actor.show();
                        // This ensures that some other section will have the selection if the
                        // single section that was being displayed did not have any items.
                        if (!selectionSet) {
                            section.resultArea.display.selectFirstItem();
                            selectionSet = true;
                        }
                    }
                }
            }
            this._searchResultsSingleShownSection = null;
        }
    },

    _findAnotherSectionWithItems: function(index, increment) {
        let pos = _getIndexWrapped(index, increment, this._searchSections.length);
        while (pos != index) {
            if (this._searchSections[pos].resultArea.display.hasItems())
                return pos;
            pos = _getIndexWrapped(pos, increment, this._searchSections.length);
        }
        return -1;
    }
};
Signals.addSignalMethods(Dash.prototype);

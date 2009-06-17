/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Signals = imports.signals;

const DocInfo = imports.misc.docInfo;
const GenericDisplay = imports.ui.genericDisplay;
const Zeitgeist = imports.ui.zeitgeist;
const Main = imports.ui.main;

/* This class represents a single display item containing information about a document.
 *
 * docInfo - DocInfo object containing information about the document
 * availableWidth - total width available for the item
 */
function DocDisplayItem(docInfo, availableWidth) {
    this._init(docInfo, availableWidth);
}

DocDisplayItem.prototype = {
    __proto__:  GenericDisplay.GenericDisplayItem.prototype,

    _init : function(docInfo, availableWidth) {
        GenericDisplay.GenericDisplayItem.prototype._init.call(this, availableWidth);     
        this._docInfo = docInfo;
    
        this._setItemInfo(docInfo.name, "",
                          docInfo.getIcon(GenericDisplay.ITEM_DISPLAY_ICON_SIZE));
    },

    //// Public methods ////

    //// Public method overrides ////

    // Opens a document represented by this display item.
    launch : function() {
        this._docInfo.launch();
    },

    //// Protected method overrides ////

    // Ensures the preview icon is created.
    _ensurePreviewIconCreated : function() {
        if (!this._previewIcon)
            this._previewIcon = this._docInfo.getIcon(GenericDisplay.PREVIEW_ICON_SIZE);
    },

    // Creates and returns a large preview icon, but only if this._docInfo is an image file
    // and we were able to generate a pixbuf from it successfully.
    _createLargePreviewIcon : function(availableWidth, availableHeight) {
        if (this._docInfo.mimeType == null || this._docInfo.mimeType.indexOf("image/") != 0)
            return null;

        return Shell.TextureCache.get_default().load_uri_sync(this._docInfo.uri, availableWidth, availableHeight);
    }
};

/* This class represents a display containing a collection of document items.
 * The documents are sorted by how recently they were last visited.
 *
 * width - width available for the display
 * height - height available for the display
 */
function DocDisplay(width, height, numberOfColumns, columnGap) {
    this._init(width, height, numberOfColumns, columnGap);
} 

DocDisplay.prototype = {
    __proto__:  GenericDisplay.GenericDisplay.prototype,

    _init : function(width, height, numberOfColumns, columnGap) {
        GenericDisplay.GenericDisplay.prototype._init.call(this, width, height, numberOfColumns, columnGap);
        Zeitgeist.recentDocsWatcher.addCallback(Lang.bind(this,
            this._refreshCache), 500); // FIXME: Do not hardcode 500. Use iterators or sth else.
    },

    //// Protected method overrides ////

    // Gets the list of recent items from the recent items manager.
    _refreshCache : function(items) {
        this._allItems = {};
        for (let i = 0; i < items.length; i++) {
            let docInfo = items[i];
            this._allItems[docInfo.uri] = docInfo;
        }
    },

    // Sets the list of the displayed items based on how recently they were last visited.
    _setDefaultList : function() {
        // It seems to be an implementation detail of the Mozilla JavaScript that object
        // properties are returned during the iteration in the same order in which they were
        // defined, but it is not a guarantee according to this 
        // https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Statements/for...in
        // While this._allItems associative array seems to always be ordered by last added,
        // as the results of this._recentManager.get_items() based on which it is constructed are,
        // we should do the sorting manually because we want the order to be based on last visited.
        //
        // This function is called each time the search string is set back to '' or we display
        // the overlay, so we are doing the sorting over the same items multiple times if the list
        // of recent items didn't change. We could store an additional array of doc ids and sort
        // them once when they are returned by this._recentManager.get_items() to avoid having to do 
        // this sorting each time, but the sorting seems to be very fast anyway, so there is no need
        // to introduce an additional class variable.
        this._matchedItems = [];
        let docIdsToRemove = [];
        for (docId in this._allItems) {
            // this._allItems[docId].exists() checks if the resource still exists
            if (this._allItems[docId].exists()) 
                this._matchedItems.push(docId);
            else 
                docIdsToRemove.push(docId);
        }

        for (docId in docIdsToRemove) {
            delete this._allItems[docId];
        }

        this._matchedItems.sort(Lang.bind(this, function (a,b) { return this._compareItems(a,b); }));
    },

    // Checks if the item info can be a match for the search string by checking
    // the name of the document. Item info is expected to be GtkRecentInfo.
    // Returns a boolean flag indicating if itemInfo is a match.
    _isInfoMatching : function(itemInfo, search) {
        if (!itemInfo.exists())
            return false;
 
        if (search == null || search == '')
            return true;

        let name = itemInfo.name.toLowerCase();
        if (name.indexOf(search) >= 0)
            return true;
        // TODO: we can also check doc URIs, so that
        // if you search for a directory name, we display recent files from it
        return false;
    },

    // Compares items associated with the item ids based on how recently the items
    // were last visited.
    // Returns an integer value indicating the result of the comparison.
   _compareItems : function(itemIdA, itemIdB) {
        let docA = this._allItems[itemIdA];
        let docB = this._allItems[itemIdB];

        return docB.lastVisited() - docA.lastVisited();
    },

    // Creates a DocDisplayItem based on itemInfo, which is expected to be a DocInfo object.
    _createDisplayItem: function(itemInfo) {
        return new DocDisplayItem(itemInfo, this._columnWidth);
    }
};

Signals.addSignalMethods(DocDisplay.prototype);

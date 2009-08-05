const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Signals = imports.signals;
const Shell = imports.gi.Shell;

const Button = imports.ui.button;
const Zeitgeist = imports.misc.zeitgeist;
const GenericDisplay = imports.ui.genericDisplay;

const TAG_DISPLAY_NAME_COLOR = new Clutter.Color();
TAG_DISPLAY_NAME_COLOR.from_pixel(0xffffffff);
const TAG_DISPLAY_BACKGROUND_COLOR = new Clutter.Color();
TAG_DISPLAY_BACKGROUND_COLOR.from_pixel(0x3d5229ff);

const TAG_DISPLAY_HEIGHT = 23;

/* This is a class that represents a tag. It creates an actor displaying the
 * label inside a box, plus a button to delete the tag.
 */
function ItemTag(parent, tag, uri) {
    this._init(parent, tag, uri);
}

ItemTag.prototype = {
    _init: function(parent, tag, docInfo) {
        let global = Shell.Global.get();

        this._parent = parent;
        this._tag = tag;
        this._docInfo = docInfo;

        this.actor = new Big.Box({ reactive: true,
                                   background_color: TAG_DISPLAY_BACKGROUND_COLOR,
                                   //corner_radius: 4,
                                   padding: 4,
                                   spacing: 4,
                                   height: TAG_DISPLAY_HEIGHT,
                                   orientation: Big.BoxOrientation.HORIZONTAL });

        let label = new Clutter.Text({ color: TAG_DISPLAY_NAME_COLOR,
                                   font_name: "Sans 14px",
                                   line_wrap: true,
                                   ellipsize: Pango.EllipsizeMode.END,
                                   text: tag });
        this.actor.append(label, Big.BoxPackFlags.EXPAND);

        let deleteIconUri = "file://" + global.imagedir + "delete.svg";
        let deleteIcon = Shell.TextureCache.get_default().load_uri_sync(Shell.TextureCachePolicy.FOREVER,
                                                                      deleteIconUri,
                                                                      GenericDisplay.LITTLE_BUTTON_SIZE,
                                                                      GenericDisplay.LITTLE_BUTTON_SIZE);
        this._deleteButton = new Button.iconButton(this.actor, GenericDisplay.LITTLE_BUTTON_SIZE, deleteIcon);
        this._deleteButton.actor.connect('button-release-event',
                                         Lang.bind(this,
                                                   function() {
                                                       this._parent.remove_actor(this.actor);
                                                       this._docInfo.tags.splice(this._docInfo.tags.indexOf(this._tag), 1);
                                                       let item = Zeitgeist.docInfoToZeitgeist(this._docInfo);
                                                       Zeitgeist.iface.UpdateItemsRemote([ item ], function(result, excp) { });
                                                       this.actor.destroy();
                                                       return true;
                                                    }));
        this.actor.append(this._deleteButton.actor, Big.BoxPackFlags.EXPAND);
    }
};

Signals.addSignalMethods(ItemTag.prototype);

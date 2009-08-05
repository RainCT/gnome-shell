const Big = imports.gi.Big;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const Signals = imports.signals;
const Shell = imports.gi.Shell;

const Button = imports.ui.button;
const GenericDisplay = imports.ui.genericDisplay;
const Zeitgeist = imports.misc.zeitgeist;

const TAG_DISPLAY_NAME_COLOR = new Clutter.Color();
TAG_DISPLAY_NAME_COLOR.from_pixel(0xffffffff);
const TAG_DISPLAY_BACKGROUND_COLOR = new Clutter.Color();
TAG_DISPLAY_BACKGROUND_COLOR.from_pixel(0x3d5229ff);

const TAG_DISPLAY_HEIGHT = 23;

function createTagLabel(text) {
    let actor = new Big.Box({ reactive: true,
                              background_color: TAG_DISPLAY_BACKGROUND_COLOR,
                              padding: 4,
                              spacing: 4,
                              height: TAG_DISPLAY_HEIGHT,
                              orientation: Big.BoxOrientation.HORIZONTAL });

    let label = new Clutter.Text({ color: TAG_DISPLAY_NAME_COLOR,
                                   font_name: "Sans 14px",
                                   line_wrap: true,
                                   ellipsize: Pango.EllipsizeMode.END,
                                   text: text });
    actor.append(label, Big.BoxPackFlags.EXPAND);

    return [actor, label];
}

/* This is a class that represents a tag. */
function ItemTag(parent, tag, uri) {
    this._init(parent, tag, uri);
}

ItemTag.prototype = {
    _init: function(parent, tag, docInfo) {
        let global = Shell.Global.get();

        this._parent = parent;
        this._tag = tag;
        this._docInfo = docInfo;

        this.actor = createTagLabel(tag)[0];

        let deleteIconUri = "file://" + global.imagedir + "close.svg";
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

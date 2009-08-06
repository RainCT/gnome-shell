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

function NewTag(parent, docInfo, replace) {
    this._init(parent, docInfo, replace);
}

NewTag.prototype = {
    _init: function(parent, docInfo, replace) {
        this._parent = parent;
        this._docInfo = docInfo;
        this._replacedActor = replace;

        this._parent.remove_actor(this._replacedActor);
        [this.actor, this._label] = createTagLabel('');
        this._label.editable = true;
        this._label.activatable = true;
        this._label.singleLineMode = true;
        this._label.min_width = 70;
        this._parent.add_actor(this.actor);

        let global = Shell.Global.get();
        this._previousFocus = global.stage.get_key_focus();
        global.stage.set_key_focus(this._label);

        this._label.connect('activate', Lang.bind(this, this._create_tag));
        this._label.connect('key-press-event', Lang.bind(this, function(o, e) {
            let symbol = Shell.get_event_key_symbol(e);
            if (symbol == Clutter.Escape)
                this._restore();
        }));
    },

    _create_tag: function(o, e) {
        this._label.editable = false;
        let text = this._label.get_text().replace('\n', ' ').replace(/,/g, ' ');
        // Strip leading and trailing whitespace
        text = text.replace(/^\s+/g, '').replace(/\s+$/g, '');
        if (text != '') {
            this._docInfo.tags.push(text);
            let item = Zeitgeist.docInfoToZeitgeist(this._docInfo);
            Zeitgeist.iface.UpdateItemsRemote([ item ], function(result, excp) { });
            this._parent.add_actor(new ItemTag(this._detailsTags,
                                               text,
                                               this._docInfo).actor);
        }
        this._restore();
    },

    _restore: function() {
        this._parent.remove_actor(this.actor);
        this._parent.add_actor(this._replacedActor);
        let global = Shell.Global.get();
        global.stage.set_key_focus(this._previousFocus);
    }
};

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

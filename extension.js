/*jshint moz:true */
// vi: sw=2 sts=2 et

const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GnomeDesktop = imports.gi.GnomeDesktop;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;
const Util = imports.misc.util;


const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Panel = imports.ui.panel;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;
const N_ = function(e) e;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const ApiProvider = Extension.imports.ApiProvider;

const Convenience = Extension.imports.convenience;

const INDICATORS_KEY = "indicators";
const FIRST_RUN_KEY = "first-run";


const _Symbols = {
  error: "\u26A0",
  refresh: "\u27f3",
  up: "\u25b2",
  down: "\u25bc",
  unchanged: " ",
};

const _Colors = {
  error: '#ff0000',
};

const _Defaults = [
  {
    api: 'bitcoinaverage',
    currency: 'USD',
    attribute: 'last'
  }
];


const MarketIndicatorView = new Lang.Class({
  Name: 'MarketIndicatorView',
  Extends: PanelMenu.Button,

  _init: function (options) {
    this.parent(0);
    this._options = options;
    this._initLayout();
    this._initBehavior();
  },

  _initLayout: function () {
    let layout = new St.BoxLayout();

    this._indicatorView = new St.Label({
      y_align: Clutter.ActorAlign.CENTER,
      style_class: "indicator"
    });

    this._statusView = new St.Label({
      y_align: Clutter.ActorAlign.CENTER,
      style_class: "status"
    });

    layout.add_actor(this._statusView);
    layout.add_actor(this._indicatorView);

    this.actor.add_actor(layout);
  },

  _initBehavior: function () {
    let indicator = this;

    this._model = _apiProvider.get(this._options.api).getModel(this._options);

    this._model.connect("update-start", function () {
      indicator._displayStatus(_Symbols.refresh);
    });

    this._model.connect("update", function (obj, err, data) {
      if (err) {
        indicator._showError(err);
      } else {
        indicator._showData(data);
      }
    });

    this._displayStatus(_Symbols.refresh);
  },

  _showError: function (error) {
    log("err " + JSON.stringify(error));
    this._displayText('error');
    this._displayStatus(_Symbols.error);
  },

  _showData: function (data) {
    let _StatusToSymbol = {
      up: _Symbols.up,
      down: _Symbols.down,
      unchanged: " "
    };

    this._displayText(data.text);

    let symbol = " ";

    if (this._options.show_change) {
      symbol = _StatusToSymbol[data.change];
    }

    this._displayStatus(symbol);
  },

  _displayStatus: function (text) {
    this._statusView.text = text;
  },

  _displayText: function (text) {
    this._indicatorView.text = text;
  },

  destroy: function () {
    this._model.destroy();
    this._indicatorView.destroy();
    this._statusView.destroy();

    this.parent();
  }
});




const ClipboardIndicator = Lang.Class({
    Name: 'ClipboardIndicator',
    Extends: PanelMenu.Button,

    _settingsChangedId: null,
    _clipboardTimeoutId: null,
    _historyLabelTimeoutId: null,
    _historyLabel: null,
    _shortcutsBindingIds: [],
    clipItemsRadioGroup: [],

    destroy: function () {
        // Call parent
        this.parent();
    },

    _init: function() {
        this._settings = Convenience.getSettings();
        this.parent(0.0, "BitcoinMarkets");
        let hbox = new St.BoxLayout({ style_class: 'system-status-icon' });
        let icon = new St.Icon({ style_class: 'bitcoinprice-icon' });
        log(Extension.path);
        icon.set_gicon(new Gio.FileIcon({ file: Gio.file_new_for_path( Extension.path + '/Bitcoin-icon.png')}));

        hbox.add_child(icon);
        this.actor.add_child(hbox);
        this._buildMenu();
    },

    _buildMenu: function () {
        let that = this;

        this._settings.get_strv(INDICATORS_KEY).forEach(function (i) {
          try {
            that._addEntry(JSON.parse(i));
          } catch (e) {
            log("error creating indicator: " + e);
          }
        }, this);
          // Add 'Settings' menu item to open settings
        let settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
        that.menu.addMenuItem(settingsMenuItem);
        settingsMenuItem.connect('activate', Lang.bind(that, that._openSettings));
    },

    _addEntry: function (options) {
      let menuItem = new PopupMenu.PopupMenuItem('');
      menuItem.menu = this.menu;
      menuItem.radioGroup = this.clipItemsRadioGroup;

      this._options = options;

      this._model = _apiProvider.get(this._options.api).getModel(this._options);
      this._model.connect("update-start", function () {
          menuItem.label.set_text(_Symbols.refresh);
        });

      this._model.connect("update", function (obj, err, data) {
          if (err) {
            menuItem.label.set_text("error");
          } else {
            menuItem.label.set_text(data.api + " - " + data.text);
          }
        });
      this.clipItemsRadioGroup.push(menuItem);
      this.menu.addMenuItem(menuItem);

     },

    _removeEntry: function (menuItem) {
        let itemIdx = this.clipItemsRadioGroup.indexOf(menuItem);

        menuItem.destroy();
        this.clipItemsRadioGroup.splice(itemIdx,1);
        this._updateCache();
    },

    _refreshIndicator: function () {
        let that = this;

        Clipboard.get_text(CLIPBOARD_TYPE, function (clipBoard, text) {
            let registry = that.clipItemsRadioGroup.map(function (menuItem) {
                return menuItem.clipContents;
            });

            if (text && registry.indexOf(text) < 0) {
                that._addEntry(text, true, false);
                that._removeOldestEntries();
            }
        });
    },

    _openSettings: function () {
        Util.spawn([
            "gnome-shell-extension-prefs",
            Extension.uuid
        ]);
    },


    _loadSettings: function () {
        this._settings = Prefs.SettingsSchema;
        this._settingsChangedId = this._settings.connect('changed',
            Lang.bind(this, this._onSettingsChange));

        this._fetchSettings();

        if (ENABLE_KEYBINDING)
            this._bindShortcuts();
    },


    _disconnectSettings: function () {
        if (!this._settingsChangedId)
            return;

        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = null;
    },

    _toggleMenu:function(){
        if(this.menu.visible)
            this.menu.close();
        else
            this.menu.open();
    }
});





let IndicatorCollection = new Lang.Class({
  Name: "IndicatorCollection",

  _init: function () {
    this._indicators = [];
    this._settings = Convenience.getSettings();

    if (this._settings.get_boolean(FIRST_RUN_KEY)) {
      this._initDefaults();
      this._settings.set_boolean(FIRST_RUN_KEY, false);
    }

    this._settingsChangedId = this._settings.connect(
      'changed::' + INDICATORS_KEY,
      Lang.bind(this, this._createIndicators)
    );
     let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box clipboard-indicator-hbox' });
        let icon = new St.Icon({ icon_name: 'edit-paste-symbolic', //'mail-attachment-symbolic',
            style_class: 'system-status-icon clipboard-indicator-icon' });

        hbox.add_child(icon);
    /*    this.parent(0).actor.add_child(hbox);*/
    this._createIndicators();
  },

  _initDefaults: function () {
    this._settings.set_strv(INDICATORS_KEY, _Defaults.map(JSON.stringify));
  },

  _createIndicators: function () {
    this._removeAll();

    this._settings.get_strv(INDICATORS_KEY).forEach(function (i) {
      try {
        this.add(new MarketIndicatorView(JSON.parse(i)));
      } catch (e) {
        log("error creating indicator: " + e);
      }
    }, this);
  },

  _removeAll: function () {
    this._indicators.forEach(function (i) i.destroy());
    this._indicators = [];
  },

  add: function (indicator) {
    this._indicators.push(indicator);
    let name = 'bitcoin-market-indicator-' + this._indicators.length;
    Main.panel.addToStatusArea(name, indicator, 999, 'left');
  },

  destroy: function () {
    this._removeAll();
    this._settings.disconnect(this._settingsChangedId);
  }
});

let _indicatorCollection;
let _apiProvider;

function init(metadata) {
  Convenience.initTranslations();
}

function enable() {
  _apiProvider = new ApiProvider.ApiProvider();
  _indicatorCollection = new ClipboardIndicator();
  Main.panel.addToStatusArea('bitcoin', _indicatorCollection, 1);
}

function disable() {
  _indicatorCollection.destroy();
  _apiProvider.destroy();
}

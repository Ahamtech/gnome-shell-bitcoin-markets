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

const Prefs = Extension.imports.prefs;

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
    api: 'unocoin',
    currency: 'INR',
    attribute: 'last'
  }
];





const IndicatorCollection = Lang.Class({
    Name: 'IndicatorCollection',
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
        let hbox = new St.BoxLayout();
        let icon = new St.Icon({ style_class: 'bitcoinprice-icon' });

        icon.set_gicon(new Gio.FileIcon({ file: Gio.file_new_for_path( Extension.path + '/Bitcoin.svg')}));

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
        log("on setting schange");
        this._settingsChangedId = this._settings.connect('changed',
            Lang.bind(this, this._onSettingsChange));
    },

    _onSettingsChange: function () {
      log("on setting schange");
        let that = this;
        while (that.clipItemsRadioGroup.length > 0) {
            let oldest = that.clipItemsRadioGroup.shift();
            oldest.actor.disconnect(oldest.buttonPressId);
            oldest.destroy();
        };

        this._settings.get_strv(INDICATORS_KEY).forEach(function (i) {
          try {
            that._addEntry(JSON.parse(i));
          } catch (e) {
            log("error creating indicator: " + e);
          }
        }, this);
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


let _indicatorCollection;
let _apiProvider;

function init(metadata) {
  Convenience.initTranslations();
}

function enable() {
  _apiProvider = new ApiProvider.ApiProvider();
  _indicatorCollection = new IndicatorCollection();
  Main.panel.addToStatusArea('bitcoin', _indicatorCollection, 1);
}

function disable() {
  _indicatorCollection.destroy();
  _apiProvider.destroy();
}

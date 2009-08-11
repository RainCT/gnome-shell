/* -*- mode: C; c-file-style: "gnu"; indent-tabs-mode: nil; -*- */

#include "shell-app-system.h"
#include <string.h>

#include <gio/gio.h>
#include <gio/gdesktopappinfo.h>
#include <gtk/gtk.h>
#include <gconf/gconf.h>
#include <gconf/gconf-client.h>

#include "shell-global.h"
#include "shell-texture-cache.h"
#include "display.h"

#define GMENU_I_KNOW_THIS_IS_UNSTABLE
#include <gmenu-tree.h>

#define SHELL_APP_FAVORITES_KEY "/desktop/gnome/shell/favorite_apps"

enum {
   PROP_0,

};

enum {
  INSTALLED_CHANGED,
  FAVORITES_CHANGED,
  LAST_SIGNAL
};

static guint signals[LAST_SIGNAL] = { 0 };

struct _ShellAppSystemPrivate {
  GMenuTree *apps_tree;
  GMenuTree *settings_tree;

  GHashTable *app_id_to_app;

  GSList *cached_app_menus; /* ShellAppMenuEntry */

  GSList *cached_settings; /* ShellAppInfo */

  GList *cached_favorites; /* utf8 */

  gint app_monitor_id;
};

static void shell_app_system_finalize (GObject *object);
static void on_tree_changed (GMenuTree *tree, gpointer user_data);
static void reread_menus (ShellAppSystem *self);
static void on_favorite_apps_changed (GConfClient *client, guint id, GConfEntry *entry, gpointer user_data);
static void reread_favorite_apps (ShellAppSystem *system);

G_DEFINE_TYPE(ShellAppSystem, shell_app_system, G_TYPE_OBJECT);

typedef enum {
  SHELL_APP_INFO_TYPE_ENTRY,
  SHELL_APP_INFO_TYPE_DESKTOP_FILE
} ShellAppInfoType;

struct _ShellAppInfo {
  ShellAppInfoType type;

  /* We need this for two reasons.  First, GKeyFile doesn't have a refcount.
   * http://bugzilla.gnome.org/show_bug.cgi?id=590808
   *
   * But more generally we'll always need it so we know when to free this
   * structure (short of weak references on each item).
   */
  guint refcount;

  GMenuTreeItem *entry;

  GKeyFile *keyfile;
  char *keyfile_path;
};

ShellAppInfo*
shell_app_info_ref (ShellAppInfo *info)
{
  info->refcount++;
  return info;
}

void
shell_app_info_unref (ShellAppInfo *info)
{
  if (--info->refcount > 0)
    return;
  switch (info->type)
  {
  case SHELL_APP_INFO_TYPE_ENTRY:
    gmenu_tree_item_unref (info->entry);
    break;
  case SHELL_APP_INFO_TYPE_DESKTOP_FILE:
    g_key_file_free (info->keyfile);
    g_free (info->keyfile_path);
    break;
  }
  g_slice_free (ShellAppInfo, info);
}

static ShellAppInfo *
shell_app_info_new_from_tree_item (GMenuTreeItem *item)
{
  ShellAppInfo *info;

  if (!item)
    return NULL;

  info = g_slice_alloc (sizeof (ShellAppInfo));
  info->type = SHELL_APP_INFO_TYPE_ENTRY;
  info->refcount = 1;
  info->entry = gmenu_tree_item_ref (item);
  return info;
}

static ShellAppInfo *
shell_app_info_new_from_keyfile_take_ownership (GKeyFile   *keyfile,
                                                const char *path)
{
  ShellAppInfo *info;

  info = g_slice_alloc (sizeof (ShellAppInfo));
  info->type = SHELL_APP_INFO_TYPE_DESKTOP_FILE;
  info->refcount = 1;
  info->keyfile = keyfile;
  info->keyfile_path = g_strdup (path);
  return info;
}

static gpointer
shell_app_menu_entry_copy (gpointer entryp)
{
  ShellAppMenuEntry *entry;
  ShellAppMenuEntry *copy;
  entry = entryp;
  copy = g_new0 (ShellAppMenuEntry, 1);
  copy->name = g_strdup (entry->name);
  copy->id = g_strdup (entry->id);
  copy->icon = g_strdup (entry->icon);
  return copy;
}

static void
shell_app_menu_entry_free (gpointer entryp)
{
  ShellAppMenuEntry *entry = entryp;
  g_free (entry->name);
  g_free (entry->id);
  g_free (entry->icon);
  g_free (entry);
}

static void shell_app_system_class_init(ShellAppSystemClass *klass)
{
  GObjectClass *gobject_class = (GObjectClass *)klass;

  gobject_class->finalize = shell_app_system_finalize;

  signals[INSTALLED_CHANGED] =
    g_signal_new ("installed-changed",
		  SHELL_TYPE_APP_SYSTEM,
		  G_SIGNAL_RUN_LAST,
		  G_STRUCT_OFFSET (ShellAppSystemClass, installed_changed),
		  NULL, NULL,
		  g_cclosure_marshal_VOID__VOID,
		  G_TYPE_NONE, 0);
  signals[FAVORITES_CHANGED] =
    g_signal_new ("favorites-changed",
                  SHELL_TYPE_APP_SYSTEM,
                  G_SIGNAL_RUN_LAST,
                  G_STRUCT_OFFSET (ShellAppSystemClass, favorites_changed),
                  NULL, NULL,
                  g_cclosure_marshal_VOID__VOID,
                  G_TYPE_NONE, 0);

  g_type_class_add_private (gobject_class, sizeof (ShellAppSystemPrivate));
}

static void
shell_app_system_init (ShellAppSystem *self)
{
  ShellAppSystemPrivate *priv;
  GConfClient *client;

  self->priv = priv = G_TYPE_INSTANCE_GET_PRIVATE (self,
                                                   SHELL_TYPE_APP_SYSTEM,
                                                   ShellAppSystemPrivate);

  /* The key is owned by the value */
  priv->app_id_to_app = g_hash_table_new_full (g_str_hash, g_str_equal,
                                               NULL, (GDestroyNotify) shell_app_info_unref);

  /* For now, we want to pick up Evince, Nautilus, etc.  We'll
   * handle NODISPLAY semantics at a higher level or investigate them
   * case by case.
   */
  priv->apps_tree = gmenu_tree_lookup ("applications.menu", GMENU_TREE_FLAGS_INCLUDE_NODISPLAY);
  priv->settings_tree = gmenu_tree_lookup ("settings.menu", GMENU_TREE_FLAGS_NONE);

  gmenu_tree_add_monitor (priv->apps_tree, on_tree_changed, self);
  gmenu_tree_add_monitor (priv->settings_tree, on_tree_changed, self);

  reread_menus (self);

  client = gconf_client_get_default ();

  self->priv->app_monitor_id = gconf_client_notify_add (client, SHELL_APP_FAVORITES_KEY,
                                                        on_favorite_apps_changed, self, NULL, NULL);
  reread_favorite_apps (self);
}

static void
shell_app_system_finalize (GObject *object)
{
  ShellAppSystem *self = SHELL_APP_SYSTEM (object);
  ShellAppSystemPrivate *priv = self->priv;

  gmenu_tree_remove_monitor (priv->apps_tree, on_tree_changed, self);
  gmenu_tree_remove_monitor (priv->settings_tree, on_tree_changed, self);

  gmenu_tree_unref (priv->apps_tree);
  gmenu_tree_unref (priv->settings_tree);

  g_hash_table_destroy (priv->app_id_to_app);

  g_slist_foreach (priv->cached_app_menus, (GFunc)shell_app_menu_entry_free, NULL);
  g_slist_free (priv->cached_app_menus);
  priv->cached_app_menus = NULL;

  g_slist_foreach (priv->cached_settings, (GFunc)shell_app_info_unref, NULL);
  g_slist_free (priv->cached_settings);
  priv->cached_settings = NULL;

  g_list_free (priv->cached_favorites);

  gconf_client_notify_remove (gconf_client_get_default (), priv->app_monitor_id);

  G_OBJECT_CLASS (shell_app_system_parent_class)->finalize(object);
}

static void
reread_directories (ShellAppSystem *self, GSList **cache, GMenuTree *tree)
{
  GMenuTreeDirectory *trunk;
  GSList *entries;
  GSList *iter;

  trunk = gmenu_tree_get_root_directory (tree);
  entries = gmenu_tree_directory_get_contents (trunk);

  g_slist_foreach (*cache, (GFunc)shell_app_menu_entry_free, NULL);
  g_slist_free (*cache);
  *cache = NULL;

  for (iter = entries; iter; iter = iter->next)
    {
      GMenuTreeItem *item = iter->data;

      switch (gmenu_tree_item_get_type (item))
        {
          case GMENU_TREE_ITEM_DIRECTORY:
            {
              GMenuTreeDirectory *dir = iter->data;
              ShellAppMenuEntry *shell_entry = g_new0 (ShellAppMenuEntry, 1);
              shell_entry->name = g_strdup (gmenu_tree_directory_get_name (dir));
              shell_entry->id = g_strdup (gmenu_tree_directory_get_menu_id (dir));
              shell_entry->icon = g_strdup (gmenu_tree_directory_get_icon (dir));

              *cache = g_slist_prepend (*cache, shell_entry);
            }
            break;
          default:
            break;
        }

      gmenu_tree_item_unref (item);
    }
  *cache = g_slist_reverse (*cache);

  g_slist_free (entries);
  gmenu_tree_item_unref (trunk);
}

static GSList *
gather_entries_recurse (ShellAppSystem     *monitor,
                        GSList             *apps,
                        GMenuTreeDirectory *root)
{
  GSList *contents;
  GSList *iter;

  contents = gmenu_tree_directory_get_contents (root);

  for (iter = contents; iter; iter = iter->next)
    {
      GMenuTreeItem *item = iter->data;
      switch (gmenu_tree_item_get_type (item))
        {
          case GMENU_TREE_ITEM_ENTRY:
            {
              ShellAppInfo *app = shell_app_info_new_from_tree_item (item);
              apps = g_slist_prepend (apps, app);
            }
            break;
          case GMENU_TREE_ITEM_DIRECTORY:
            {
              GMenuTreeDirectory *dir = (GMenuTreeDirectory*)item;
              apps = gather_entries_recurse (monitor, apps, dir);
            }
            break;
          default:
            break;
        }
      gmenu_tree_item_unref (item);
    }

  g_slist_free (contents);

  return apps;
}

static void
reread_entries (ShellAppSystem     *self,
                GSList            **cache,
                GMenuTree          *tree)
{
  GMenuTreeDirectory *trunk;

  trunk = gmenu_tree_get_root_directory (tree);

  g_slist_foreach (*cache, (GFunc)shell_app_info_unref, NULL);
  g_slist_free (*cache);
  *cache = NULL;

  *cache = gather_entries_recurse (self, *cache, trunk);

  gmenu_tree_item_unref (trunk);
}

static void
cache_by_id (ShellAppSystem *self, GSList *apps, gboolean ref)
{
  GSList *iter;

  for (iter = apps; iter; iter = iter->next)
    {
      ShellAppInfo *info = iter->data;
      if (ref)
        shell_app_info_ref (info);
      /* the name is owned by the info itself */
      g_hash_table_insert (self->priv->app_id_to_app, (char*)shell_app_info_get_id (info),
                           info);
    }
}

static void
reread_menus (ShellAppSystem *self)
{
  GSList *apps;
  GMenuTreeDirectory *trunk;

  reread_directories (self, &(self->priv->cached_app_menus), self->priv->apps_tree);

  reread_entries (self, &(self->priv->cached_settings), self->priv->settings_tree);

  /* Now loop over applications.menu and settings.menu, inserting each by desktop file
   * ID into a hash */
  g_hash_table_remove_all (self->priv->app_id_to_app);
  trunk = gmenu_tree_get_root_directory (self->priv->apps_tree);
  apps = gather_entries_recurse (self, NULL, trunk);
  gmenu_tree_item_unref (trunk);
  cache_by_id (self, apps, FALSE);
  g_slist_free (apps);
  cache_by_id (self, self->priv->cached_settings, TRUE);
}

static void
on_tree_changed (GMenuTree *monitor, gpointer user_data)
{
  ShellAppSystem *self = SHELL_APP_SYSTEM (user_data);

  g_signal_emit (self, signals[INSTALLED_CHANGED], 0);

  reread_menus (self);
}

static GList *
convert_gconf_value_string_list_to_list_uniquify (GConfValue *value )
{
  GSList *list;
  GSList *tmp;
  GList *result = NULL;
  GHashTable *tmp_table = g_hash_table_new (g_str_hash, g_str_equal);

  list = gconf_value_get_list (value);

  for (tmp = list ; tmp; tmp = tmp->next)
    {
      GConfValue *value = tmp->data;
      char *str = g_strdup (gconf_value_get_string (value));
      if (!str)
        continue;
      if (g_hash_table_lookup (tmp_table, str))
        {
          g_free (str);
          continue;
        }
      g_hash_table_insert (tmp_table, str, GUINT_TO_POINTER(1));
      result = g_list_prepend (result, str);
    }
  g_hash_table_destroy (tmp_table);
  return g_list_reverse (result);
}

static void
reread_favorite_apps (ShellAppSystem *system)
{
  GConfClient *client = gconf_client_get_default ();
  GConfValue *val;

  val = gconf_client_get (client, SHELL_APP_FAVORITES_KEY, NULL);

  if (!(val && val->type == GCONF_VALUE_LIST && gconf_value_get_list_type (val) == GCONF_VALUE_STRING))
    return;

  g_list_foreach (system->priv->cached_favorites, (GFunc) g_free, NULL);
  g_list_free (system->priv->cached_favorites);
  system->priv->cached_favorites = convert_gconf_value_string_list_to_list_uniquify (val);

  gconf_value_free (val);
}

void
on_favorite_apps_changed (GConfClient *client,
                          guint        id,
                          GConfEntry  *entry,
                          gpointer     user_data)
{
  ShellAppSystem *system = SHELL_APP_SYSTEM (user_data);
  reread_favorite_apps (system);
  g_signal_emit (G_OBJECT (system), signals[FAVORITES_CHANGED], 0);
}

GType
shell_app_info_get_type (void)
{
  static GType gtype = G_TYPE_INVALID;
  if (gtype == G_TYPE_INVALID)
    {
      gtype = g_boxed_type_register_static ("ShellAppInfo",
          (GBoxedCopyFunc)shell_app_info_ref,
          (GBoxedFreeFunc)shell_app_info_unref);
    }
  return gtype;
}

GType
shell_app_menu_entry_get_type (void)
{
  static GType gtype = G_TYPE_INVALID;
  if (gtype == G_TYPE_INVALID)
    {
      gtype = g_boxed_type_register_static ("ShellAppMenuEntry",
          shell_app_menu_entry_copy,
          shell_app_menu_entry_free);
    }
  return gtype;
}

/**
 * shell_app_system_get_applications_for_menu:
 *
 * Traverses a toplevel menu, and returns all items under it.  Nested items
 * are flattened.
 *
 * Return value: (transfer container) (element-type ShellAppInfo): List of applications
 */
GSList *
shell_app_system_get_applications_for_menu (ShellAppSystem *monitor,
                                            const char *menu)
{
  char *path;
  GMenuTreeDirectory *menu_entry;
  GSList *apps;

  path = g_strdup_printf ("/%s", menu);
  menu_entry = gmenu_tree_get_directory_from_path (monitor->priv->apps_tree, path);
  g_free (path);
  g_assert (menu_entry != NULL);

  apps = gather_entries_recurse (monitor, NULL, menu_entry);

  gmenu_tree_item_unref (menu_entry);

  return apps;
}

/**
 * shell_app_system_get_menus:
 *
 * Returns a list of toplevel #ShellAppMenuEntry items
 *
 * Return value: (transfer none) (element-type AppMenuEntry): List of toplevel menus
 */
GSList *
shell_app_system_get_menus (ShellAppSystem *monitor)
{
  return monitor->priv->cached_app_menus;
}

/**
 * shell_app_system_get_all_settings:
 *
 * Returns a list of application items under "settings.menu".
 *
 * Return value: (transfer none) (element-type ShellAppInfo): List of applications
 */
GSList *
shell_app_system_get_all_settings (ShellAppSystem *monitor)
{
  return monitor->priv->cached_settings;
}

/**
 * shell_app_system_get_default:
 *
 * Return Value: (transfer none): The global #ShellAppSystem singleton
 */
ShellAppSystem *
shell_app_system_get_default ()
{
  static ShellAppSystem *instance = NULL;

  if (instance == NULL)
    instance = g_object_new (SHELL_TYPE_APP_SYSTEM, NULL);

  return instance;
}

/**
 * shell_app_system_get_favorites:
 *
 * Return the list of applications which have been explicitly added to the
 * favorites.
 *
 * Return value: (transfer none) (element-type utf8): List of favorite application ids
 */
GList *
shell_app_system_get_favorites (ShellAppSystem *system)
{
  return system->priv->cached_favorites;
}

static void
set_gconf_value_string_list (GConfValue *val, GList *items)
{
  GList *iter;
  GSList *tmp = NULL;

  for (iter = items; iter; iter = iter->next)
    {
      const char *str = iter->data;
      GConfValue *strval = gconf_value_new (GCONF_VALUE_STRING);
      gconf_value_set_string (strval, str);
      tmp = g_slist_prepend (tmp, strval);
    }
  tmp = g_slist_reverse (tmp);

  gconf_value_set_list (val, tmp);
  g_slist_free (tmp);
}



void
shell_app_system_add_favorite (ShellAppSystem *system, const char *id)
{
  GConfClient *client = gconf_client_get_default ();
  GConfValue *val;
  GList *iter;

  iter = g_list_find_custom (system->priv->cached_favorites, id, (GCompareFunc)strcmp);
  if (iter)
    return;

  val = gconf_value_new (GCONF_VALUE_LIST);
  gconf_value_set_list_type (val, GCONF_VALUE_STRING);

  system->priv->cached_favorites = g_list_append (system->priv->cached_favorites, g_strdup (id));

  set_gconf_value_string_list (val, system->priv->cached_favorites);
  gconf_client_set (client, SHELL_APP_FAVORITES_KEY, val, NULL);
}

void
shell_app_system_remove_favorite (ShellAppSystem *system, const char *id)
{
  GConfClient *client = gconf_client_get_default ();
  GConfValue *val;
  GList *iter;

  iter = g_list_find_custom (system->priv->cached_favorites, id, (GCompareFunc)strcmp);
  if (!iter)
    return;
  g_free (iter->data);
  system->priv->cached_favorites = g_list_delete_link (system->priv->cached_favorites, iter);

  val = gconf_value_new (GCONF_VALUE_LIST);
  gconf_value_set_list_type (val, GCONF_VALUE_STRING);

  set_gconf_value_string_list (val, system->priv->cached_favorites);
  gconf_client_set (client, SHELL_APP_FAVORITES_KEY, val, NULL);
}

/**
 * shell_app_system_lookup_app:
 *
 * Return value: (transfer full): The #ShellAppInfo for id, or %NULL if none
 */
ShellAppInfo *
shell_app_system_lookup_cached_app (ShellAppSystem *self, const char *id)
{
  ShellAppInfo *info;

  info = g_hash_table_lookup (self->priv->app_id_to_app, id);
  if (info)
    shell_app_info_ref (info);
  return info;
}

ShellAppInfo *
shell_app_system_load_from_desktop_file (ShellAppSystem   *system,
                                         const char       *filename,
                                         GError          **error)
{
  ShellAppInfo *appinfo;
  GKeyFile *keyfile;
  char *full_path = NULL;
  gboolean success;

  keyfile = g_key_file_new ();

  if (strchr (filename, '/') != NULL)
    {
      success = g_key_file_load_from_file (keyfile, filename, G_KEY_FILE_NONE, error);
      full_path = g_strdup (filename);
    }
  else
    {
      char *app_path = g_build_filename ("applications", filename, NULL);
      success = g_key_file_load_from_data_dirs (keyfile, app_path, &full_path,
                                                G_KEY_FILE_NONE, error);
      g_free (app_path);
    }

  if (!success)
    {
      g_key_file_free (keyfile);
      g_free (full_path);
      return NULL;
    }

  appinfo = shell_app_info_new_from_keyfile_take_ownership (keyfile, full_path);
  g_free (full_path);

  return appinfo;
}

/**
 * shell_app_system_lookup_heuristic_basename:
 * @name: Probable application identifier
 *
 * Find a valid application corresponding to a given
 * heuristically determined application identifier
 * string, or %NULL if none.
 *
 * Returns: (transfer full): A #ShellAppInfo for name
 */
ShellAppInfo *
shell_app_system_lookup_heuristic_basename (ShellAppSystem *system,
                                            const char *name)
{
  char *tmpid;
  ShellAppInfo *result;

  result = shell_app_system_lookup_cached_app (system, name);
  if (result != NULL)
    return result;

  /* These are common "vendor prefixes".  But using
   * WM_CLASS as a source, we don't get the vendor
   * prefix.  So try stripping them.
   */
  tmpid = g_strjoin ("", "gnome-", name, NULL);
  result = shell_app_system_lookup_cached_app (system, tmpid);
  g_free (tmpid);
  if (result != NULL)
    return result;

  tmpid = g_strjoin ("", "fedora-", name, NULL);
  result = shell_app_system_lookup_cached_app (system, tmpid);
  g_free (tmpid);
  if (result != NULL)
    return result;

  return NULL;
}

const char *
shell_app_info_get_id (ShellAppInfo *info)
{
  switch (info->type)
  {
    case SHELL_APP_INFO_TYPE_ENTRY:
      return gmenu_tree_entry_get_desktop_file_id ((GMenuTreeEntry*)info->entry);
    case SHELL_APP_INFO_TYPE_DESKTOP_FILE:
      return info->keyfile_path;
  }
  g_assert_not_reached ();
  return NULL;
}

#define DESKTOP_ENTRY_GROUP "Desktop Entry"

char *
shell_app_info_get_name (ShellAppInfo *info)
{
  switch (info->type)
  {
    case SHELL_APP_INFO_TYPE_ENTRY:
      return g_strdup (gmenu_tree_entry_get_name ((GMenuTreeEntry*)info->entry));
    case SHELL_APP_INFO_TYPE_DESKTOP_FILE:
      return g_key_file_get_locale_string (info->keyfile, DESKTOP_ENTRY_GROUP, "Name", NULL, NULL);
  }
  g_assert_not_reached ();
  return NULL;
}

char *
shell_app_info_get_description (ShellAppInfo *info)
{
  switch (info->type)
  {
    case SHELL_APP_INFO_TYPE_ENTRY:
      return g_strdup (gmenu_tree_entry_get_comment ((GMenuTreeEntry*)info->entry));
    case SHELL_APP_INFO_TYPE_DESKTOP_FILE:
      return g_key_file_get_locale_string (info->keyfile, DESKTOP_ENTRY_GROUP, "Comment", NULL, NULL);
  }
  g_assert_not_reached ();
  return NULL;
}

char *
shell_app_info_get_executable (ShellAppInfo *info)
{
  switch (info->type)
  {
    case SHELL_APP_INFO_TYPE_ENTRY:
      return g_strdup (gmenu_tree_entry_get_exec ((GMenuTreeEntry*)info->entry));
    case SHELL_APP_INFO_TYPE_DESKTOP_FILE:
      return g_key_file_get_string (info->keyfile, DESKTOP_ENTRY_GROUP, "Exec", NULL);
  }
  g_assert_not_reached ();
  return NULL;
}

char *
shell_app_info_get_desktop_file_path (ShellAppInfo *info)
{
  switch (info->type)
  {
    case SHELL_APP_INFO_TYPE_ENTRY:
      return g_strdup (gmenu_tree_entry_get_desktop_file_path ((GMenuTreeEntry*)info->entry));
    case SHELL_APP_INFO_TYPE_DESKTOP_FILE:
      return g_strdup (info->keyfile_path);;
  }
  g_assert_not_reached ();
  return NULL;
}

GIcon *
shell_app_info_get_icon (ShellAppInfo *info)
{
  char *iconname = NULL;
  GIcon *icon;

  /* This code adapted from gdesktopappinfo.c
   * Copyright (C) 2006-2007 Red Hat, Inc.
   * Copyright © 2007 Ryan Lortie
   * LGPL
   */

  switch (info->type)
  {
    case SHELL_APP_INFO_TYPE_ENTRY:
      iconname = g_strdup (gmenu_tree_entry_get_icon ((GMenuTreeEntry*)info->entry));
      break;
    case SHELL_APP_INFO_TYPE_DESKTOP_FILE:
      iconname = g_key_file_get_locale_string (info->keyfile, DESKTOP_ENTRY_GROUP, "Icon", NULL, NULL);
      break;
  }

  if (!iconname)
    return NULL;

  if (g_path_is_absolute (iconname))
    {
      GFile *file;

      file = g_file_new_for_path (iconname);
      icon = G_ICON (g_file_icon_new (file));
      g_object_unref (file);
    }
  else
    {
      char *tmp_name, *p;
      tmp_name = strdup (iconname);
      /* Work around a common mistake in desktop files */
      if ((p = strrchr (tmp_name, '.')) != NULL &&
          (strcmp (p, ".png") == 0 ||
           strcmp (p, ".xpm") == 0 ||
           strcmp (p, ".svg") == 0))
        {
          *p = 0;
        }

      icon = g_themed_icon_new (tmp_name);
      g_free (tmp_name);
    }
  g_free (iconname);

  return icon;
}

GSList *
shell_app_info_get_categories (ShellAppInfo *info)
{
  return NULL; /* TODO */
}

gboolean
shell_app_info_get_is_nodisplay (ShellAppInfo *info)
{
  switch (info->type)
  {
    case SHELL_APP_INFO_TYPE_ENTRY:
      return gmenu_tree_entry_get_is_nodisplay ((GMenuTreeEntry*)info);
    case SHELL_APP_INFO_TYPE_DESKTOP_FILE:
      return FALSE;
  }
  g_assert_not_reached ();
  return TRUE;
}

/**
 * shell_app_info_create_icon_texture:
 *
 * Look up the icon for this application, and create a #ClutterTexture
 * for it at the given size.
 *
 * Return value: (transfer none): A floating #ClutterActor
 */
ClutterActor *
shell_app_info_create_icon_texture (ShellAppInfo *info, float size)
{
  GIcon *icon;
  ClutterActor *ret;

  icon = shell_app_info_get_icon (info);
  if (!icon)
    {
      ret = clutter_texture_new ();
      g_object_set (ret, "opacity", 0, "width", size, "height", size, NULL);
      return ret;
    }

  return shell_texture_cache_load_gicon (shell_texture_cache_get_default (), icon, (int)size);
}

/**
 * shell_app_info_launch_full:
 * @timestamp: Event timestamp, or 0 for current event timestamp
 * @uris: List of uris to pass to application
 * @workspace: Start on this workspace, or -1 for default
 * @startup_id: (out): Returned startup notification ID, or %NULL if none
 * @error: A #GError
 */
gboolean
shell_app_info_launch_full (ShellAppInfo *info,
                            guint         timestamp,
                            GList        *uris,
                            int           workspace,
                            char        **startup_id,
                            GError      **error)
{
  GDesktopAppInfo *gapp;
  char *filename;
  GdkAppLaunchContext *context;
  gboolean ret;
  ShellGlobal *global;
  MetaScreen *screen;
  MetaDisplay *display;

  if (startup_id)
    *startup_id = NULL;

  filename = shell_app_info_get_desktop_file_path (info);
  gapp = g_desktop_app_info_new_from_filename (filename);
  g_free (filename);

  if (!gapp)
    {
      g_set_error (error, G_IO_ERROR, G_IO_ERROR_NOT_FOUND, "Not found");
      return FALSE;
    }

  global = shell_global_get ();
  screen = shell_global_get_screen (global);
  display = meta_screen_get_display (screen);

  if (timestamp == 0)
    timestamp = meta_display_get_current_time (display);
  if (workspace < 0)
    workspace = meta_screen_get_active_workspace_index (screen);

  context = gdk_app_launch_context_new ();
  gdk_app_launch_context_set_timestamp (context, timestamp);
  gdk_app_launch_context_set_desktop (context, workspace);

  ret = g_app_info_launch (G_APP_INFO (gapp), uris, (GAppLaunchContext*) context, error);

  g_object_unref (G_OBJECT (gapp));

  return ret;
}

gboolean
shell_app_info_launch (ShellAppInfo    *info,
                       GError         **error)
{
  return shell_app_info_launch_full (info, 0, NULL, -1, NULL, error);
}

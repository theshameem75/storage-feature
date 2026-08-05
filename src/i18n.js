import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const constructEnUS = {
  dms: {
    title: 'DMS',
    'card.subtitle': 'folders · files · sharing',
    'search.placeholder': 'search this org…',
    'tab.browse': 'browse',
    'tab.search': 'search',
    'tab.trash': 'trash',
    'tab.sharing': 'sharing',
    'action.newFolder': '+ new folder',
    'action.upload': 'upload file',
    'action.download': 'download',
    'action.rename': 'rename',
    'action.move': 'move',
    'action.copy': 'copy',
    'action.delete': 'delete',
    'action.versions': 'versions',
    'action.share': 'share',
    'action.restore': 'restore',
    'action.permanentDelete': 'purge',
    'empty.children': 'no items in this folder',
    'empty.search': 'no matches yet — type a query and run',
    'empty.trash': 'trash is empty',
    'modal.newFolder.title': 'new folder',
    'modal.newFolder.placeholder': 'folder name',
    'modal.rename.title': 'rename',
    'modal.move.title': 'move to…',
    'modal.upload.title': 'upload file',
    'modal.share.title': 'grant access',
    'modal.share.placeholder': 'user or group id',
    'modal.share.principalId': 'principalId',
    'modal.share.permissions': 'permissions',
    'modal.share.inherit': 'inherit',
    'modal.confirm': 'confirm',
    'modal.cancel': 'cancel',
    'toast.created': 'created',
    'toast.renamed': 'renamed',
    'toast.moved': 'moved',
    'toast.deleted': 'deleted',
    'toast.uploaded': 'uploaded',
    'toast.downloaded': 'downloaded',
    'toast.restored': 'restored',
    'toast.shared': 'shared',
    'toast.inheritanceToggled': 'inheritance toggled',
    'error.generic': 'request failed',
    'error.noActiveOrg': 'no active org',
  },
};

i18n.use(initReactI18next).init({
  fallbackLng: 'en-US',
  lng: localStorage.getItem('blocks-os-language') || 'en-US',
  ns: ['construct'],
  defaultNS: 'construct',
  interpolation: {
    escapeValue: false,
  },
  react: {
    // re-render components when a translation bundle is added at runtime
    // (UILM files are fetched after first paint), not only on languageChanged
    bindI18nStore: 'added',
  },
  resources: {
    'en-US': {
      construct: constructEnUS,
    },
  },
});

export default i18n;

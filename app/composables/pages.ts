import { useSettings } from '~/composables/useSettings';

export const NO_NAV_CATEGORY = '__no_nav__';
const FLAT_CATEGORIES = ['main'];
const PAGE_ORDER = [
  '/feed',
  '/library',
  '/devices',
];
function sortByPageOrder(items: any[]) {
  return items.toSorted((a: any, b: any) => {
    const indexA = PAGE_ORDER.indexOf(a.to);
    const indexB = PAGE_ORDER.indexOf(b.to);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return 1;
    return indexA - indexB;
  });
}
export const usePages = () => {
  const router = useRouter();
  const { pageCategories } = useAppConfig();
  const { debugMode } = useSettings();
  const { t } = useI18n();
  const pages = computed(() => {
    const hiddenCategories = debugMode.value ? [] : ['debug'];
    const routes = router.getRoutes().filter(
      (route) => ['index', 'all', 'artist-id', 'album-id'].includes(route.name as string) === false,
    );
    const categorizedRoutes = routes.reduce((acc, route) => {
      const category = route.meta.category as string || 'other';
      if (!category || category === NO_NAV_CATEGORY || hiddenCategories.includes(category)) return acc;
      const catConfig = pageCategories[category as keyof typeof pageCategories];
      if (!acc[category]) {
        acc[category] = {
          label: catConfig?.labelKey ? t(catConfig.labelKey) : category,
          icon: catConfig?.icon || 'i-lucide-folder',
          to: route.path,
          children: [],
        };
      }
      const nameKey = route.meta.nameKey as string | undefined;
      const descriptionKey = route.meta.descriptionKey as string | undefined;
      acc[category].children.push({
        label: nameKey ? t(nameKey) : (route.meta.name as string || route.name),
        description: descriptionKey ? t(descriptionKey) : (route.meta.description as string),
        icon: route.meta.icon || 'i-lucide-file',
        to: route.path,
      });
      return acc;
    }, {} as Record<string, any>);
    const categoryOrder = Object.keys(pageCategories);
    const result: any[] = [];
    for (const category of categoryOrder) {
      if (!categorizedRoutes[category]) continue;
      const catConfig = pageCategories[category as keyof typeof pageCategories];
      categorizedRoutes[category].label = catConfig?.labelKey ? t(catConfig.labelKey) : category;
      const children = sortByPageOrder(categorizedRoutes[category].children);
      if (FLAT_CATEGORIES.includes(category)) {
        result.push(...children);
      } else {
        result.push({ ...categorizedRoutes[category], children });
      }
    }
    return result;
  });
  return {
    pages,
  };
};

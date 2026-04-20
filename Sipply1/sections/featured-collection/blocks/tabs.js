defineModule('theme-featured-collection-tabs', () => {
    class FeaturedCollectionTabs extends HTMLElement {
        #tab_items = this.querySelectorAll('.featured-collection__tab');
        #sectionId = this.dataset.sectionId;
        #carouselClassName = '.featured-collection__carousel';
        #loadingClassName = '.featured-collection__tabs-loading';
        #tabsContentInnerClassName = '.featured-collection__tabs-content-inner';
        #viewMoreButtonClassName = '.featured-collection__view-more';
        #cache = new Map();
        get #loading() {
            return this.dataset.loading === 'true';
        }
        set #loading(force) {
            this.dataset.loading = String(force);
            this.querySelector(this.#loadingClassName).classList.toggle('hidden', !force);
            this.querySelector(this.#tabsContentInnerClassName).classList.toggle('hidden', force);
        }
        constructor() {
            super();
            const blockId = this.#tab_items[0].dataset.blockId;
            this.#cache.set(blockId, this.querySelector(this.#carouselClassName));
            this.#cache.set(this.#getViewMoreButtonCacheKey(blockId), this.querySelector(this.#viewMoreButtonClassName));
            this.bindEvents(this.querySelectorAll('.featured-collection__tab'));
        }
        bindEvents(tabItems) {
            tabItems.forEach((tab) => {
                tab.addEventListener('click', (event) => {
                    const target = event.currentTarget;
                    const { blockId } = target.dataset;
                    this.#switchTo(blockId);
                });
            });
        }
        #switchTo(blockId) {
            if (this.#loading) {
                return;
            }
            this.#tab_items.forEach((tab) => {
                if (tab.dataset.blockId === blockId) {
                    tab.classList.add('active');
                    return;
                }
                tab.classList.remove('active');
            });
            this.#fetchProducts(blockId);
        }
        #getViewMoreButtonCacheKey(blockId) {
            return `${blockId}_view-more`;
        }
        async #fetchProducts(blockId) {
            const viewMoreButtonCacheKey = this.#getViewMoreButtonCacheKey(blockId);
            const cached = this.#cache.get(blockId);
            const cachedViewMore = this.#cache.get(viewMoreButtonCacheKey);
            if (cached) {
                cached.querySelector(this.#loadingClassName).classList.add('hidden');
                cached.querySelector(this.#tabsContentInnerClassName).classList.remove('hidden');
                const carousel = this.querySelector(this.#carouselClassName);
                carousel.replaceWith(cached);
                cached.reset();
                const viewMoreButton = this.querySelector(this.#viewMoreButtonClassName);
                viewMoreButton.replaceWith(cachedViewMore);
                return;
            }
            this.#loading = true;
            try {
                const queryPath = new URL(window.location);
                const { searchParams } = queryPath;
                searchParams.append('section_id', this.#sectionId);
                searchParams.append('attributes', JSON.stringify({
                    block_id: blockId,
                }));
                const response = await fetch(queryPath.toString());
                const responseText = await response.text();
                const responseHTML = new DOMParser().parseFromString(responseText, 'text/html');
                responseHTML?.querySelectorAll(`style[${window.Shopline.styleSelector.local}]`).forEach((style) => {
                    document.body.append(style);
                });
                const carousel = responseHTML.querySelector(this.#carouselClassName);
                this.querySelector(this.#carouselClassName).replaceWith(carousel);
                const viewMoreButton = responseHTML.querySelector(this.#viewMoreButtonClassName);
                this.querySelector(this.#viewMoreButtonClassName).replaceWith(viewMoreButton);
                this.#cache.set(blockId, carousel);
                this.#cache.set(viewMoreButtonCacheKey, viewMoreButton);
                this.bindEvents(carousel.querySelectorAll('.featured-collection__tab'));
            }
            catch (error) {
                console.error(error);
            }
            finally {
                this.#loading = false;
            }
        }
    }
    customElements.define('theme-featured-collection-tabs', FeaturedCollectionTabs);
});

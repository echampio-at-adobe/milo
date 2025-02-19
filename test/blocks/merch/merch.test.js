import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';
import { delay } from '../../helpers/waitfor.js';

import { CheckoutWorkflow, CheckoutWorkflowStep, Defaults, Log } from '../../../libs/deps/commerce.js';

import merch, {
  PRICE_TEMPLATE_DISCOUNT,
  PRICE_TEMPLATE_OPTICAL,
  PRICE_TEMPLATE_STRIKETHROUGH,
  buildCta,
  getCheckoutContext,
  initService,
  priceLiteralsURL,
  fetchCheckoutLinkConfigs,
  getCheckoutLinkConfig,
  getDownloadAction,
  fetchEntitlements,
  getModalAction,
  getCheckoutAction,
} from '../../../libs/blocks/merch/merch.js';

import { mockFetch, unmockFetch } from './mocks/fetch.js';
import { mockIms, unmockIms } from './mocks/ims.js';
import { createTag, setConfig } from '../../../libs/utils/utils.js';
import getUserEntitlements from '../../../libs/blocks/global-navigation/utilities/getUserEntitlements.js';

const CHECKOUT_LINK_CONFIGS = {
  data: [{
    PRODUCT_FAMILY: 'PHOTOSHOP',
    DOWNLOAD_TEXT: '',
    DOWNLOAD_URL: 'https://creativecloud.adobe.com/apps/download/photoshop',
    FREE_TRIAL_PATH: '/cc-shared/fragments/trial-modals/photoshop',
    BUY_NOW_PATH: '/cc-shared/fragments/buy-modals/photoshop',
    LOCALE: '',
  },
  {
    PRODUCT_FAMILY: 'ILLUSTRATOR',
    DOWNLOAD_TEXT: 'Download',
    DOWNLOAD_URL: 'https://creativecloud.adobe.com/apps/download/illustrator',
    FREE_TRIAL_PATH: 'https://www.adobe.com/mini-plans/illustrator.html?mid=ft&web=1',
    BUY_NOW_PATH: 'https://www.adobe.com/plans-fragments/modals/individual/modals-content-rich/illustrator/master.modal.html',
    LOCALE: '',
  },
  {
    PRODUCT_FAMILY: 'PHOTOSHOP',
    DOWNLOAD_TEXT: '',
    DOWNLOAD_URL: 'https://creativecloud.adobe.com/fr/apps/download/photoshop?q=123',
    FREE_TRIAL_PATH: '❌',
    BUY_NOW_PATH: 'X',
    LOCALE: 'fr',
  },
  { PRODUCT_FAMILY: 'CC_ALL_APPS', DOWNLOAD_URL: 'https://creativecloud.adobe.com/apps/download', LOCALE: '' }],
};

const config = {
  codeRoot: '/libs',
  commerce: { priceLiteralsURL },
  env: { name: 'prod' },
  imsClientId: 'test_client_id',
  placeholders: { 'upgrade-now': 'Upgrade Now', download: 'Download' },
};

/**
 * utility function that tests Price spans against mock HTML
 *
 * @param {util} selector price span selector
 * @param {*} expectedAttributes { <attribute key in element dataset>:
 * <expected attribute value, UNDEF if should be undefined>}
 */
const validatePriceSpan = async (selector, expectedAttributes) => {
  const el = await merch(document.querySelector(
    selector,
  ));
  const { nodeName, dataset } = await el.onceSettled();
  expect(nodeName).to.equal('SPAN');
  Object.keys(expectedAttributes).forEach((key) => {
    const value = expectedAttributes[key];
    expect(dataset[key], ` ${key} should equal ${value}`).to.equal(value);
  });
  return el;
};

const SUBSCRIPTION_DATA_ALL_APPS_RAW_ELIGIBLE = [
  {
    change_plan_available: true,
    offer: { product_arrangement: { family: 'CC_ALL_APPS' } },
  },
];

const SUBSCRIPTION_DATA_PHSP_RAW_ELIGIBLE = [
  {
    change_plan_available: true,
    offer: {
      offer_id: '5F2E4A8FD58D70C8860F51A4DE042E0C',
      product_arrangement: { family: 'PHOTOSHOP' },
    },
  },
];

const PROD_DOMAINS = [
  'www.adobe.com',
  'www.stage.adobe.com',
  'helpx.adobe.com',
];

describe('Merch Block', () => {
  let setCheckoutLinkConfigs;
  let setSubscriptionsData;

  after(async () => {
    delete window.lana;
    setCheckoutLinkConfigs();
    unmockFetch();
    unmockIms();
  });

  before(async () => {
    window.lana = { log: () => { } };
    document.head.innerHTML = await readFile({ path: './mocks/head.html' });
    document.body.innerHTML = await readFile({ path: './mocks/body.html' });
    ({ setCheckoutLinkConfigs, setSubscriptionsData } = await mockFetch());
    setCheckoutLinkConfigs(CHECKOUT_LINK_CONFIGS);
  });

  beforeEach(async () => {
    setConfig(config);
    await mockIms('CH');
    await initService(true);
    Log.reset();
    Log.use(Log.Plugins.quietFilter);
  });

  afterEach(() => {
    setSubscriptionsData();
  });

  it('does not decorate merch with bad content', async () => {
    let el = document.querySelector('.bad-content');
    expect(await merch(el)).to.be.undefined;
    el = document.querySelector('.merch.bad-content');
    expect(await merch(el)).to.be.null;
  });

  describe('prices', () => {
    it('renders merch link to price without term (new)', async () => {
      await validatePriceSpan('.merch.price.hide-term', { displayRecurrence: 'false' });
    });

    it('renders merch link to price with term', async () => {
      await validatePriceSpan('.merch.price.term', { displayRecurrence: undefined });
    });

    it('renders merch link to price with term and seat', async () => {
      await validatePriceSpan('.merch.price.seat', { displayPerUnit: 'true' });
    });

    it('renders merch link to price with term and tax', async () => {
      await validatePriceSpan('.merch.price.tax', { displayTax: 'true' });
    });

    it('renders merch link to price with term, seat and tax', async () => {
      await validatePriceSpan('.merch.price.seat.tax', { displayTax: 'true' });
    });

    it('renders merch link to strikethrough price with term, seat and tax', async () => {
      await validatePriceSpan('.merch.price.strikethrough', { template: PRICE_TEMPLATE_STRIKETHROUGH });
    });

    it('renders merch link to optical price with term, seat and tax', async () => {
      await validatePriceSpan('.merch.price.optical', { template: PRICE_TEMPLATE_OPTICAL });
    });

    it('renders merch link to discount price', async () => {
      await validatePriceSpan('.merch.price.discount', { template: PRICE_TEMPLATE_DISCOUNT });
    });

    it('renders merch link to tax exclusive price with tax exclusive attribute', async () => {
      await validatePriceSpan('.merch.price.tax-exclusive', { forceTaxExclusive: 'true' });
    });

    it('renders merch link to GB price', async () => {
      const el = await validatePriceSpan('.merch.price.gb', {});
      expect(/£/.test(el.textContent)).to.be.true;
    });
  });

  describe('promo prices', () => {
    it('renders merch link to promo price with discount', async () => {
      await validatePriceSpan('.merch.price.oldprice', { promotionCode: undefined });
    });

    it('renders merch link to promo price without discount', async () => {
      await validatePriceSpan('.merch.strikethrough.oldprice', {
        template: PRICE_TEMPLATE_STRIKETHROUGH,
        promotionCode: undefined,
      });
    });

    it('renders merch link to promo price with discount', async () => {
      await validatePriceSpan('.merch.price.promo', { promotionCode: 'nicopromo' });
    });

    it('renders merch link to full promo price', async () => {
      await validatePriceSpan('.merch.price.promo', { promotionCode: 'nicopromo' });
    });
  });

  describe('promo prices in a fragment', () => {
    it('renders merch link to promo price with discount', async () => {
      await validatePriceSpan('.fragment .merch.price.oldprice', { promotionCode: undefined });
    });

    it('renders merch link to promo price without discount', async () => {
      await validatePriceSpan('.fragment .merch.strikethrough.oldprice', {
        template: PRICE_TEMPLATE_STRIKETHROUGH,
        promotionCode: undefined,
      });
    });

    it('renders merch link to promo price with discount', async () => {
      await validatePriceSpan('.fragment .merch.price.promo', { promotionCode: 'nicopromo' });
    });

    it('renders merch link to full promo price', async () => {
      await validatePriceSpan('.fragment .merch.price.promo', { promotionCode: 'nicopromo' });
    });
  });

  describe('CTAs', () => {
    it('renders merch link to CTA, default values', async () => {
      await initService(true);
      const el = await merch(document.querySelector(
        '.merch.cta',
      ));
      const { dataset, href, nodeName, textContent } = await el.onceSettled();
      const url = new URL(href);
      expect(nodeName).to.equal('A');
      expect(textContent).to.equal('Buy Now');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      expect(dataset.promotionCode).to.equal(undefined);
      expect(dataset.checkoutWorkflow).to.equal(Defaults.checkoutWorkflow);
      expect(dataset.checkoutWorkflowStep).to.equal(Defaults.checkoutWorkflowStep);
      expect(dataset.checkoutMarketSegment).to.equal(undefined);
      expect(url.searchParams.get('cli')).to.equal(Defaults.checkoutClientId);
    });

    it('renders merch link to CTA, config values', async () => {
      setConfig({
        ...config,
        commerce: { ...config.commerce, checkoutClientId: 'dc' },
      });
      mockIms();
      await initService(true);
      const el = await merch(document.querySelector(
        '.merch.cta.config',
      ));
      const { dataset, href, nodeName, textContent } = await el.onceSettled();
      const url = new URL(href);
      expect(nodeName).to.equal('A');
      expect(textContent).to.equal('Buy Now');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      expect(dataset.promotionCode).to.equal(undefined);
      expect(dataset.checkoutWorkflow).to.equal(Defaults.checkoutWorkflow);
      expect(dataset.checkoutWorkflowStep).to.equal(Defaults.checkoutWorkflowStep);
      expect(dataset.checkoutMarketSegment).to.equal(undefined);
      expect(url.searchParams.get('cli')).to.equal('dc');
    });

    it('renders merch link to CTA, metadata values', async () => {
      setConfig({ ...config });
      const metadata = createTag('meta', { name: 'checkout-workflow', content: CheckoutWorkflow.V2 });
      document.head.appendChild(metadata);
      await initService(true);
      const el = await merch(document.querySelector(
        '.merch.cta.metadata',
      ));
      const { dataset, href, nodeName, textContent } = await el.onceSettled();
      const url = new URL(href);
      expect(nodeName).to.equal('A');
      expect(textContent).to.equal('Buy Now');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      expect(dataset.promotionCode).to.equal(undefined);
      expect(dataset.checkoutWorkflow).to.equal(CheckoutWorkflow.V2);
      expect(dataset.checkoutWorkflowStep).to.equal(CheckoutWorkflowStep.CHECKOUT);
      expect(dataset.checkoutMarketSegment).to.equal(undefined);
      expect(url.searchParams.get('cli')).to.equal(Defaults.checkoutClientId);
      document.head.removeChild(metadata);
    });

    it('renders merch link to cta for GB locale', async () => {
      await mockIms();
      await initService(true);
      const el = await merch(document.querySelector(
        '.merch.cta.gb',
      ));
      const { nodeName, href } = await el.onceSettled();
      expect(nodeName).to.equal('A');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      expect(/0ADF92A6C8514F2800BE9E87DB641D2A/.test(href)).to.be.true;
    });

    it('renders merch link to cta with empty promo', async () => {
      const el = await merch(document.querySelector(
        '.merch.cta.nopromo',
      ));
      const { nodeName, dataset } = await el.onceSettled();
      expect(nodeName).to.equal('A');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      expect(dataset.promotionCode).to.equal(undefined);
    });

    it('renders merch link to cta with empty promo in a fragment', async () => {
      const el = await merch(document.querySelector(
        '.fragment .merch.cta.nopromo',
      ));
      const { nodeName, dataset } = await el.onceSettled();
      expect(nodeName).to.equal('A');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      expect(dataset.promotionCode).to.equal(undefined);
    });

    it('renders merch link to promo cta with discount', async () => {
      const el = await merch(document.querySelector(
        '.merch.cta.promo',
      ));
      const { nodeName, dataset } = await el.onceSettled();
      expect(nodeName).to.equal('A');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      expect(dataset.promotionCode).to.equal('nicopromo');
    });

    it('renders merch link to promo cta with discount in a fragment', async () => {
      const el = await merch(document.querySelector(
        '.fragment .merch.cta.promo',
      ));
      const { nodeName, dataset } = await el.onceSettled();
      expect(nodeName).to.equal('A');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      expect(dataset.promotionCode).to.equal('nicopromo');
    });

    it('renders merch link to UCv2 cta with link-level overrides', async () => {
      const el = await merch(document.querySelector(
        '.merch.cta.link-overrides',
      ));
      const { nodeName, dataset } = await el.onceSettled();
      expect(nodeName).to.equal('A');
      expect(el.getAttribute('is')).to.equal('checkout-link');
      // https://wiki.corp.adobe.com/pages/viewpage.action?spaceKey=BPS&title=UCv2+Link+Creation+Guide
      expect(dataset.checkoutWorkflow).to.equal('UCv2');
      expect(dataset.checkoutWorkflowStep).to.equal('checkout');
      expect(dataset.checkoutMarketSegment).to.equal('EDU');
    });

    it('adds ims country to checkout link', async () => {
      await mockIms('CH');
      await initService(true);
      const el = await merch(document.querySelector(
        '.merch.cta.ims',
      ));
      const { dataset } = await el.onceSettled();
      expect(dataset.imsCountry).to.equal('CH');
    });

    it('renders blue CTAs', async () => {
      const els = await Promise.all([...document.querySelectorAll(
        '.merch.cta.strong',
      )].map(merch));
      expect(els.length).to.equal(2);
      els.forEach((el) => {
        expect(el.classList.contains('blue')).to.be.true;
      });
    });

    it('renders large CTA inside a marquee', async () => {
      const el = await merch(document.querySelector(
        '.merch.cta.inside-marquee',
      ));
      const { classList } = await el.onceSettled();
      expect(classList.contains('button-l')).to.be.true;
    });
  });

  describe('function "getCheckoutContext"', () => {
    it('returns null if context params do not have osi', async () => {
      const el = document.createElement('a');
      const params = new URLSearchParams();
      expect(await getCheckoutContext(el, params)).to.be.null;
    });
  });

  describe('function "buildCta"', () => {
    it('returns null if context params do not have osi', async () => {
      const el = document.createElement('a');
      const params = new URLSearchParams();
      expect(await buildCta(el, params)).to.be.null;
    });
  });

  describe('TWP and D2P modals', () => {
  });

  describe('Download flow', () => {
    it('supports download use case', async () => {
      mockIms();
      getUserEntitlements();
      mockIms('US');
      setSubscriptionsData(SUBSCRIPTION_DATA_PHSP_RAW_ELIGIBLE);
      await initService(true);
      const cta1 = await merch(document.querySelector('.merch.cta.download'));
      await cta1.onceSettled();
      const [{ DOWNLOAD_URL }] = CHECKOUT_LINK_CONFIGS.data;
      expect(cta1.textContent).to.equal('Download');
      expect(cta1.href).to.equal(DOWNLOAD_URL);

      const cta2 = await merch(document.querySelector('.merch.cta.no-entitlement-check'));
      await cta2.onceSettled();
      expect(cta2.textContent).to.equal('Buy Now');
      expect(cta2.href).to.not.equal(DOWNLOAD_URL);
    });

    it('supports download use case with locale specific values', async () => {
      const newConfig = setConfig({
        ...config,
        pathname: '/fr/test.html',
        locales: { fr: { ietf: 'fr-FR' } },
        prodDomains: PROD_DOMAINS,
        placeholders: { download: 'Télécharger' },
      });
      mockIms();
      getUserEntitlements();
      mockIms('FR');
      setSubscriptionsData(SUBSCRIPTION_DATA_PHSP_RAW_ELIGIBLE);
      await initService(true);
      const cta = await merch(document.querySelector('.merch.cta.download.fr'));
      await cta.onceSettled();
      const [,, { DOWNLOAD_URL }] = CHECKOUT_LINK_CONFIGS.data;
      expect(cta.textContent).to.equal(newConfig.placeholders.download);
      expect(cta.href).to.equal(DOWNLOAD_URL);
    });

    it('fetchCheckoutLinkConfigs: returns null if mapping cannot be fetched', async () => {
      fetchCheckoutLinkConfigs.promise = undefined;
      setCheckoutLinkConfigs(null);
      const mappings = await fetchCheckoutLinkConfigs();
      expect(mappings).to.be.undefined;
      setCheckoutLinkConfigs(CHECKOUT_LINK_CONFIGS);
      fetchCheckoutLinkConfigs.promise = undefined;
    });

    it('getCheckoutLinkConfig: returns undefined if productFamily is not found', async () => {
      const checkoutLinkConfig = await getCheckoutLinkConfig('XYZ');
      expect(checkoutLinkConfig).to.be.undefined;
    });

    it('getDownloadAction: returns undefined', async () => {
      const checkoutLinkConfig = await getDownloadAction({ entitlement: true }, Promise.resolve(true), 'ILLUSTRATOR');
      expect(checkoutLinkConfig).to.be.undefined;
    });

    it('getDownloadAction: returns download action for CC_ALL_APPS', async () => {
      fetchEntitlements.promise = undefined;
      mockIms();
      getUserEntitlements();
      mockIms('US');
      setSubscriptionsData(SUBSCRIPTION_DATA_ALL_APPS_RAW_ELIGIBLE);
      const { url } = await getDownloadAction({ entitlement: true }, Promise.resolve(true), 'CC_ALL_APPS');
      expect(url).to.equal('https://creativecloud.adobe.com/apps/download');
    });

    it('getModalAction: returns undefined if checkout-link config is not found', async () => {
      fetchCheckoutLinkConfigs.promise = undefined;
      setCheckoutLinkConfigs(CHECKOUT_LINK_CONFIGS);
      const action = await getModalAction({}, { modal: true }, 'XYZ');
      expect(action).to.be.undefined;
    });

    it('getModalAction: returns undefined if modal path is cancelled', async () => {
      setConfig({
        ...config,
        pathname: '/fr/test.html',
        locales: { fr: { ietf: 'fr-FR' } },
        prodDomains: PROD_DOMAINS,
        placeholders: { download: 'Télécharger' },
      });
      fetchCheckoutLinkConfigs.promise = undefined;
      setCheckoutLinkConfigs(CHECKOUT_LINK_CONFIGS);
      const action = await getModalAction([{}], { modal: true }, 'PHOTOSHOP');
      expect(action).to.be.undefined;
    });

    it('getCheckoutAction: handles errors gracefully', async () => {
      const action = await getCheckoutAction([{ productArrangement: {} }], {}, Promise.reject(new Error('error')));
      expect(action).to.be.undefined;
    });
  });

  describe('Upgrade Flow', () => {
    it('updates CTA text to Upgrade Now', async () => {
      mockIms();
      getUserEntitlements();
      mockIms('US');
      setSubscriptionsData(SUBSCRIPTION_DATA_PHSP_RAW_ELIGIBLE);
      await initService(true);
      const target = await merch(document.querySelector('.merch.cta.upgrade-target'));
      await target.onceSettled();
      const sourceCta = await merch(document.querySelector('.merch.cta.upgrade-source'));
      await sourceCta.onceSettled();
      expect(sourceCta.textContent).to.equal('Upgrade Now');
    });
  });

  describe('Modal flow', () => {
    it('renders TWP modal', async () => {
      mockIms();
      const el = document.querySelector('.merch.cta.twp');
      const cta = await merch(el);
      const { nodeName, textContent } = await cta.onceSettled();
      expect(nodeName).to.equal('A');
      expect(textContent).to.equal('Free Trial');
      expect(cta.getAttribute('href')).to.equal('#');
      cta.click();
      await delay(100);
      expect(document.querySelector('iframe').src).to.equal('https://www.adobe.com/mini-plans/illustrator.html?mid=ft&web=1');
      const modal = document.getElementById('checkout-link-modal');
      expect(modal).to.exist;
      document.querySelector('.modal-curtain').click();
    });

    it('renders D2P modal', async () => {
      mockIms();
      const el = document.querySelector('.merch.cta.d2p');
      const cta = await merch(el);
      const { nodeName, textContent } = await cta.onceSettled();
      expect(nodeName).to.equal('A');
      expect(textContent).to.equal('Buy Now');
      expect(cta.getAttribute('href')).to.equal('#');
      cta.click();
      await delay(100);
      expect(document.querySelector('iframe').src).to.equal('https://www.adobe.com/plans-fragments/modals/individual/modals-content-rich/illustrator/master.modal.html');
      const modal = document.getElementById('checkout-link-modal');
      expect(modal).to.exist;
      document.querySelector('.modal-curtain').click();
    });
  });
});

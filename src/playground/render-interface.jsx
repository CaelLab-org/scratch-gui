/*
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / XMUER Coding Engine
 * Licensed under the GNU Affero General Public License, Version 3 (AGPL-3.0-only)
 * https://www.gnu.org/licenses/agpl-3.0.txt
 * Source: https://github.com/CaelLab-org/scratch-gui
 * Project: https://engine.xmuer.online/
 */

/**
 * Copyright (C) 2021 Thomas Weber
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {FormattedMessage, defineMessages, injectIntl, intlShape} from 'react-intl';
import {getIsLoading} from '../reducers/project-state.js';
import AppStateHOC from '../lib/app-state-hoc.jsx';
import ErrorBoundaryHOC from '../lib/error-boundary-hoc.jsx';
import TWProjectMetaFetcherHOC from '../lib/tw-project-meta-fetcher-hoc.jsx';
import TWStateManagerHOC from '../lib/tw-state-manager-hoc.jsx';
import SBFileUploaderHOC from '../lib/sb-file-uploader-hoc.jsx';
import TWPackagerIntegrationHOC from '../lib/tw-packager-integration-hoc.jsx';
import SettingsStore from '../addons/settings-store-singleton';
import '../lib/tw-fix-history-api';
import GUI from './render-gui.jsx';
import MenuBar from '../components/menu-bar/menu-bar.jsx';
import ProjectInput from '../components/tw-project-input/project-input.jsx';

import Description from '../components/tw-description/description.jsx';
import BrowserModal from '../components/browser-modal/browser-modal.jsx';
import CloudVariableBadge from '../containers/tw-cloud-variable-badge.jsx';
import TWWindchimeSubmitter from '../containers/tw-windchime-submitter.jsx';
import {isBrowserSupported} from '../lib/tw-environment-support-prober';
import AddonChannels from '../addons/channels';
import {loadServiceWorker} from './load-service-worker';
import runAddons from '../addons/entry';
import InvalidEmbed from '../components/tw-invalid-embed/invalid-embed.jsx';
import {APP_NAME} from '../lib/brand.js';
import {getLocaleFromPath, getBCP47Code} from '../lib/locales-config.js';
import AIPanel from './ai/panel.jsx';
import xceLogo from '../../static/xce-logo.png';

import styles from './interface.css';

const isInvalidEmbed = window.parent !== window;

// 获取当前语言前缀（BCP47格式），如 /zh-CN
const getCurrentLocalePrefix = () => {
    const locale = getLocaleFromPath(window.location.pathname);
    if (!locale) return '';
    return `/${getBCP47Code(locale)}`;
};

const handleClickAddonSettings = addonId => {
    // addonId might be a string of the addon to focus on, undefined, or an event (treat like undefined)
    const localePrefix = getCurrentLocalePrefix();
    const path = process.env.ROUTING_STYLE === 'wildcard' ? 'addons' : 'addons.html';
    const url = `${process.env.ROOT}${localePrefix}/${path}${typeof addonId === 'string' ? `#${addonId}` : ''}`;
    window.open(url);
};

const messages = defineMessages({
    defaultTitle: {
        defaultMessage: 'AI block coding editor',
        description: 'Title of homepage',
        id: 'tw.guiDefaultTitle'
    }
});

const WrappedMenuBar = compose(
    SBFileUploaderHOC,
    TWPackagerIntegrationHOC
)(MenuBar);

if (AddonChannels.reloadChannel) {
    AddonChannels.reloadChannel.addEventListener('message', () => {
        location.reload();
    });
}

if (AddonChannels.changeChannel) {
    AddonChannels.changeChannel.addEventListener('message', e => {
        SettingsStore.setStoreWithVersionCheck(e.data);
    });
}

runAddons();

const IconArrowRight = () => (
    <svg
        aria-hidden="true"
        className={styles.linkArrow}
        viewBox="0 0 12 12"
    >
        <path
            d="M2.5 6h7M6.6 2.9 9.7 6l-3.1 3.1"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
        />
    </svg>
);

const IconLink = ({className}) => (
    <svg
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        viewBox="0 0 20 20"
    >
        <path d="M8.4 11.6 11.6 8.4" />
        <path d="M9.7 6.7l1.3-1.3a2.9 2.9 0 0 1 4.1 4.1l-1.3 1.3" />
        <path d="M10.3 13.3l-1.3 1.3a2.9 2.9 0 0 1-4.1-4.1l1.3-1.3" />
    </svg>
);

IconLink.propTypes = {
    className: PropTypes.string
};

const IconChevron = ({open}) => (
    <svg
        aria-hidden="true"
        className={classNames(styles.openChevron, {
            [styles.openChevronOpen]: open
        })}
        viewBox="0 0 12 12"
    >
        <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
        />
    </svg>
);

IconChevron.propTypes = {
    open: PropTypes.bool
};

const MockFlag = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
    >
        <path
            d="M2.2 1.4v9.2"
            stroke="#7a5b00"
            strokeLinecap="round"
            strokeWidth="1.1"
        />
        <path
            d="M2.2 1.8h7.1L7.8 4.1l1.5 2.3H2.2z"
            fill="#45993d"
        />
    </svg>
);

const MockStop = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
    >
        <path
            d="M3.9 1.2h4.2l2.7 2.7v4.2l-2.7 2.7H3.9L1.2 8.1V3.9z"
            fill="#ec5959"
        />
    </svg>
);

const IconTerminal = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
    >
        <rect
            fill="none"
            height="11.5"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
            width="14.5"
            x="2.75"
            y="4.25"
        />
        <path
            d="M6.5 8.3 8.7 10l-2.2 1.7M10.8 12h2.9"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
        />
    </svg>
);

const IconBolt = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
    >
        <path
            d="M10.9 2.4 4.9 11.1h4.2l-1 6.5 6.2-8.7h-4.3z"
            fill="none"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="1.5"
        />
    </svg>
);

const IconAddons = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
    >
        <rect
            fill="none"
            height="5.6"
            rx="1.4"
            stroke="currentColor"
            strokeWidth="1.5"
            width="5.6"
            x="3"
            y="3"
        />
        <rect
            fill="none"
            height="5.6"
            rx="1.4"
            stroke="currentColor"
            strokeWidth="1.5"
            width="5.6"
            x="11.4"
            y="3"
        />
        <rect
            fill="none"
            height="5.6"
            rx="1.4"
            stroke="currentColor"
            strokeWidth="1.5"
            width="5.6"
            x="3"
            y="11.4"
        />
        <rect
            fill="none"
            height="5.6"
            rx="1.4"
            stroke="currentColor"
            strokeWidth="1.5"
            width="5.6"
            x="11.4"
            y="11.4"
        />
    </svg>
);

const IconDesktop = () => (
    <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
    >
        <rect
            fill="none"
            height="10"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.5"
            width="14.5"
            x="2.75"
            y="3.75"
        />
        <path
            d="M10 13.75V16.5M7.6 16.5h4.8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
        />
    </svg>
);

const HomeMock = () => (
    <div
        aria-hidden="true"
        className={styles.mock}
    >
        <div className={styles.mockBar}>
            <img
                alt=""
                className={styles.mockMark}
                src={xceLogo}
            />
            <span className={styles.mockLabel}>
                <FormattedMessage
                    defaultMessage="Example project"
                    description="Label on the editor preview on the homepage"
                    id="tw.home.mock.label"
                />
            </span>
        </div>
        <div className={styles.mockBody}>
            <div className={styles.mockScript}>
                <div className={classNames(styles.mockBlock, styles.mockBlockHat)}>
                    <MockFlag />
                    <FormattedMessage
                        defaultMessage="when green flag clicked"
                        description="Example block in homepage preview"
                        id="tw.home.mock.hat"
                    />
                </div>
                <div className={classNames(styles.mockBlock, styles.mockBlockControl)}>
                    <FormattedMessage
                        defaultMessage="repeat 10"
                        description="Example block in homepage preview"
                        id="tw.home.mock.loop"
                    />
                </div>
                <div
                    className={classNames(
                        styles.mockBlock,
                        styles.mockBlockMotion,
                        styles.mockBlockNested
                    )}
                >
                    <FormattedMessage
                        defaultMessage="move 10 steps"
                        description="Example block in homepage preview"
                        id="tw.home.mock.move"
                    />
                </div>
                <div className={classNames(styles.mockBlock, styles.mockBlockLooks)}>
                    <FormattedMessage
                        defaultMessage="say Hello!"
                        description="Example block in homepage preview"
                        id="tw.home.mock.say"
                    />
                </div>
            </div>
            <div className={styles.mockStageCol}>
                <div className={styles.mockStageTools}>
                    <MockFlag />
                    <MockStop />
                </div>
                <div className={styles.mockStage}>
                    <div className={styles.mockScene}>
                        <span className={styles.mockBubble}>
                            <FormattedMessage
                                defaultMessage="Hello!"
                                description="Speech bubble in the homepage editor preview"
                                id="tw.home.mock.bubble"
                            />
                        </span>
                        <img
                            alt=""
                            className={styles.mockSprite}
                            src={xceLogo}
                        />
                    </div>
                </div>
                <div className={styles.mockSprites}>
                    <span className={styles.mockSpriteChip}>
                        <img
                            alt=""
                            src={xceLogo}
                        />
                    </span>
                    <span className={styles.mockAddSprite}>{'+'}</span>
                </div>
            </div>
        </div>
    </div>
);

const Footer = () => (
    <footer className={styles.footer}>
        <div className={styles.footerInner}>
            <div className={styles.footerAbout}>
                <div className={styles.footerBrand}>
                    <img
                        alt=""
                        className={styles.footerMark}
                        src={xceLogo}
                    />
                    <span>{APP_NAME}</span>
                </div>
                <p className={styles.footerText}>
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="{APP_NAME} is not affiliated with Scratch, the Scratch Team, or the Scratch Foundation."
                        description="Disclaimer that TurboWarp is not connected to Scratch"
                        id="tw.footer.disclaimer"
                        values={{
                            APP_NAME
                        }}
                    />
                </p>
                <p className={styles.footerText}>
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Scratch is a project of the Scratch Foundation. It is available for free at {scratchDotOrg}."
                        description="A disclaimer that Scratch requires when referring to Scratch. {scratchDotOrg} is a link with text 'https://scratch.org/'"
                        id="tw.footer.scratchDisclaimer"
                        values={{
                            scratchDotOrg: (
                                <a
                                    href="https://scratch.org/"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {'https://scratch.org/'}
                                </a>
                            )
                        }}
                    />
                </p>
            </div>
            <nav className={styles.footerNav}>
                <a href={`${getCurrentLocalePrefix()}/credits`}>
                    <FormattedMessage
                        defaultMessage="Credits"
                        description="Credits link in footer"
                        id="tw.footer.credits"
                    />
                </a>
                <a href="/xce-agent/">{'XCE Agent'}</a>
                <a href="/desktop/">{'XCE Desktop'}</a>
                <a href="https://packager.xmuer.online/">{'XMUER Coding Packager'}</a>
                <a href="https://coding.xmuer.online/">{'XMUER Coding Community'}</a>
                <a
                    href="https://coding.xmuer.online/topics"
                    rel="noreferrer"
                    target="_blank"
                >
                    <FormattedMessage
                        defaultMessage="Feedback & Bugs"
                        description="Footer link to feedback/bug report"
                        id="tw.footer.feedback"
                    />
                </a>
                <a
                    href="https://github.com/CaelLab-org/scratch-gui"
                    rel="noreferrer"
                    target="_blank"
                >
                    <FormattedMessage
                        defaultMessage="Source Code"
                        description="Footer link to source code"
                        id="tw.footer.sourceCode"
                    />
                </a>
                <a href="privacy.html">
                    <FormattedMessage
                        defaultMessage="Privacy Policy"
                        description="Footer link to privacy policy"
                        id="tw.footer.privacy"
                    />
                </a>
            </nav>
        </div>
        <div className={styles.footerMeta}>
            <span>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="XCE would not be possible without the {turbowarp} open source project."
                    description="TurboWarp credit in footer"
                    id="tw.footer.turbowarpCredit"
                    values={{
                        turbowarp: (
                            <a
                                href="https://turbowarp.org/"
                                rel="noreferrer"
                                target="_blank"
                            >
                                {'TurboWarp'}
                            </a>
                        )
                    }}
                />
            </span>
            <span>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="{APP_NAME} is an open source project by {caelab}."
                    description="CaelLab attribution in footer"
                    id="tw.footer.caelab"
                    values={{
                        APP_NAME,
                        caelab: (
                            <a
                                href="https://www.caellab.com/"
                                rel="noreferrer"
                                target="_blank"
                            >
                                {'CaelLab'}
                            </a>
                        )
                    }}
                />
            </span>
        </div>
    </footer>
);

class Interface extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            projectInputOpen: false
        };
        this.openPanelRef = React.createRef();
        this.handleToggleProjectInput = this.handleToggleProjectInput.bind(this);
        this.handleUpdateProjectTitle = this.handleUpdateProjectTitle.bind(this);
    }
    componentDidUpdate (prevProps, prevState) {
        if (prevProps.isLoading && !this.props.isLoading) {
            loadServiceWorker();
        }
        if (!prevState.projectInputOpen && this.state.projectInputOpen && this.openPanelRef.current) {
            const input = this.openPanelRef.current.querySelector('input');
            if (input) {
                input.focus();
            }
        }
    }
    handleToggleProjectInput () {
        this.setState(prevState => ({
            projectInputOpen: !prevState.projectInputOpen
        }));
    }
    handleUpdateProjectTitle (title, isDefault) {
        if (isDefault || !title) {
            document.title = `${APP_NAME} - ${this.props.intl.formatMessage(messages.defaultTitle)}`;
        } else {
            document.title = `${title} - ${APP_NAME}`;
        }
    }
    render () {
        if (isInvalidEmbed) {
            return <InvalidEmbed />;
        }

        const {
            /* eslint-disable no-unused-vars */
            intl,
            hasCloudVariables,
            description,
            isFullScreen,
            isLoading,
            isPlayerOnly,
            isRtl,
            projectId,
            /* eslint-enable no-unused-vars */
            ...props
        } = this.props;
        const isHomepage = isPlayerOnly && !isFullScreen;
        const isEditor = !isPlayerOnly;
        return (
            <div
                className={classNames(styles.container, {
                    [styles.playerOnly]: isHomepage,
                    [styles.editor]: isEditor
                })}
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                <TWWindchimeSubmitter />
                {isHomepage ? (
                    <div className={styles.menu}>
                        <WrappedMenuBar
                            canChangeLanguage
                            canManageFiles
                            canChangeTheme
                            enableSeeInside
                            onClickAddonSettings={handleClickAddonSettings}
                        />
                    </div>
                ) : null}
                <div
                    className={classNames(styles.center, {
                        [styles.guiHidden]: isHomepage
                    })}
                    style={isPlayerOnly ? ({
                        // + 2 accounts for 1px border on each side of the stage
                        width: `${Math.max(480, props.customStageSize.width) + 2}px`
                    }) : null}
                >
                    <GUI
                        onClickAddonSettings={handleClickAddonSettings}
                        onUpdateProjectTitle={this.handleUpdateProjectTitle}
                        backpackVisible
                        backpackHost="_local_"
                        {...props}
                    />
                    {isEditor ? <AIPanel /> : null}
                    {isHomepage ? null : (
                        <React.Fragment>
                            {isBrowserSupported() ? null : (
                                <BrowserModal isRtl={isRtl} />
                            )}
                            {hasCloudVariables && projectId !== '0' && (
                                <div className={styles.section}>
                                    <CloudVariableBadge />
                                </div>
                            )}
                            {description.instructions || description.credits ? (
                                <div className={styles.section}>
                                    <Description
                                        instructions={description.instructions}
                                        credits={description.credits}
                                        projectId={projectId}
                                    />
                                </div>
                            ) : null}
                        </React.Fragment>
                    )}
                </div>
                {/* Homepage content: rendered OUTSIDE .center to avoid layout conflicts */}
                {isHomepage ? (
                    <div className={styles.homepageContainer}>
                        <React.Fragment>
                            {isBrowserSupported() ? null : (
                                <BrowserModal isRtl={isRtl} />
                            )}
                            <div className={styles.home}>
                                <section className={styles.hero}>
                                    <div className={styles.heroCopy}>
                                        <div className={styles.eyebrow}>
                                            <img
                                                alt=""
                                                className={styles.eyebrowLogo}
                                                src={xceLogo}
                                            />
                                            <FormattedMessage
                                                defaultMessage="CaelLab"
                                                description="Brand line on the homepage"
                                                id="tw.home.eyebrow"
                                            />
                                        </div>
                                        <h1 className={styles.heroTitle}>{APP_NAME}</h1>
                                        <p className={styles.heroLead}>
                                            <FormattedMessage
                                                // eslint-disable-next-line max-len
                                                defaultMessage="An online block coding editor built on Scratch. Its XCE Agent reads your project, writes blocks, and edits costumes when you describe what should change."
                                                description="Lead paragraph on homepage"
                                                id="tw.home.lead"
                                            />
                                        </p>

                                        <div className={styles.openProject}>
                                            <button
                                                aria-expanded={this.state.projectInputOpen}
                                                className={styles.openToggle}
                                                type="button"
                                                onClick={this.handleToggleProjectInput}
                                            >
                                                <IconLink className={styles.toggleIcon} />
                                                <FormattedMessage
                                                    defaultMessage="Open a project from Scratch"
                                                    // eslint-disable-next-line max-len
                                                    description="Expandable control to open a Scratch project by ID or link"
                                                    id="tw.home.openProject"
                                                />
                                                <IconChevron open={this.state.projectInputOpen} />
                                            </button>
                                            {this.state.projectInputOpen ? (
                                                <div
                                                    className={styles.openPanel}
                                                    ref={this.openPanelRef}
                                                >
                                                    <div className={styles.openField}>
                                                        <IconLink className={styles.fieldIcon} />
                                                        <ProjectInput />
                                                    </div>
                                                    <p className={styles.openHint}>
                                                        <FormattedMessage
                                                            // eslint-disable-next-line max-len
                                                            defaultMessage="Paste a Scratch project ID or link, then press Enter."
                                                            description="Hint under the project input on homepage"
                                                            id="tw.home.projectHint"
                                                        />
                                                    </p>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className={styles.heroLinks}>
                                            <a href="/xce-agent/">
                                                <FormattedMessage
                                                    defaultMessage="XCE Agent guide"
                                                    description="Link to the XCE Agent guide"
                                                    id="tw.home.agentGuide"
                                                />
                                                <IconArrowRight />
                                            </a>
                                            <a href="/desktop/">
                                                <FormattedMessage
                                                    defaultMessage="Desktop app"
                                                    description="Link to the desktop app download page"
                                                    id="tw.home.desktopLink"
                                                />
                                                <IconArrowRight />
                                            </a>
                                        </div>
                                    </div>
                                    <HomeMock />
                                </section>

                                {(
                                    // eslint-disable-next-line max-len
                                    description.instructions === 'unshared' || description.credits === 'unshared'
                                ) && (
                                    <div className={styles.section}>
                                        <div className={classNames(styles.infobox, styles.unsharedUpdate)}>
                                            <p>
                                                <FormattedMessage
                                                    defaultMessage="Unshared projects are no longer visible."
                                                    description="Appears on unshared projects"
                                                    id="tw.unshared2.1"
                                                />
                                            </p>
                                            <p>
                                                <FormattedMessage
                                                    defaultMessage="For more information, visit: {link}"
                                                    description="Appears on unshared projects"
                                                    id="tw.unshared.2"
                                                    values={{
                                                        link: (
                                                            <a
                                                                href="https://docs.turbowarp.org/unshared-projects"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                {'https://docs.turbowarp.org/unshared-projects'}
                                                            </a>
                                                        )
                                                    }}
                                                />
                                            </p>
                                            <p>
                                                <FormattedMessage
                                                    // eslint-disable-next-line max-len
                                                    defaultMessage="If the project was shared recently, this message may appear incorrectly for a few minutes."
                                                    description="Appears on unshared projects"
                                                    id="tw.unshared.cache"
                                                />
                                            </p>
                                            <p>
                                                <FormattedMessage
                                                    // eslint-disable-next-line max-len
                                                    defaultMessage="If this project is actually shared, please report a bug."
                                                    description="Appears on unshared projects"
                                                    id="tw.unshared.bug"
                                                />
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {hasCloudVariables && projectId !== '0' && (
                                    <div className={styles.section}>
                                        <CloudVariableBadge />
                                    </div>
                                )}
                                {description.instructions || description.credits ? (
                                    <div className={styles.section}>
                                        <Description
                                            instructions={description.instructions}
                                            credits={description.credits}
                                            projectId={projectId}
                                        />
                                    </div>
                                ) : null}

                                <section className={styles.editorSection}>
                                    <h2 className={styles.sectionTitle}>
                                        <FormattedMessage
                                            defaultMessage="Inside the editor"
                                            description="Heading of the feature list on homepage"
                                            id="tw.home.sectionEditor"
                                        />
                                    </h2>
                                    <div className={styles.featureGrid}>
                                        <div className={styles.feature}>
                                            <div className={styles.featureHead}>
                                                <span className={styles.featureIcon}>
                                                    <IconTerminal />
                                                </span>
                                                <h3 className={styles.featureTitle}>{'XCE Agent'}</h3>
                                            </div>
                                            <p className={styles.featureDesc}>
                                                <FormattedMessage
                                                    // eslint-disable-next-line max-len
                                                    defaultMessage="Say what should change. It can read your scripts and costumes, add blocks, edit costumes, and run the project to check the result."
                                                    description="XCE Agent feature description"
                                                    id="tw.home.agent.desc"
                                                />
                                            </p>
                                        </div>
                                        <div className={styles.feature}>
                                            <div className={styles.featureHead}>
                                                <span className={styles.featureIcon}>
                                                    <IconBolt />
                                                </span>
                                                <h3 className={styles.featureTitle}>
                                                    <FormattedMessage
                                                        defaultMessage="Compiled runtime"
                                                        description="Compiled runtime feature title"
                                                        id="tw.home.runtime.title"
                                                    />
                                                </h3>
                                            </div>
                                            <p className={styles.featureDesc}>
                                                <FormattedMessage
                                                    // eslint-disable-next-line max-len
                                                    defaultMessage="Scripts compile to JavaScript while the project runs. Loops and clones see the biggest gains."
                                                    description="Compiled runtime feature description"
                                                    id="tw.home.runtime.desc"
                                                />
                                            </p>
                                        </div>
                                        <div className={styles.feature}>
                                            <div className={styles.featureHead}>
                                                <span className={styles.featureIcon}>
                                                    <IconAddons />
                                                </span>
                                                <h3 className={styles.featureTitle}>
                                                    <FormattedMessage
                                                        defaultMessage="Addons"
                                                        description="Addons feature title"
                                                        id="tw.home.addons.title"
                                                    />
                                                </h3>
                                            </div>
                                            <p className={styles.featureDesc}>
                                                <FormattedMessage
                                                    // eslint-disable-next-line max-len
                                                    defaultMessage="Community addons for the editor, enabled when you need them."
                                                    description="Addons feature description"
                                                    id="tw.home.addons.desc"
                                                />
                                            </p>
                                        </div>
                                        <div className={styles.feature}>
                                            <div className={styles.featureHead}>
                                                <span className={styles.featureIcon}>
                                                    <IconDesktop />
                                                </span>
                                                <h3 className={styles.featureTitle}>
                                                    <FormattedMessage
                                                        defaultMessage="Desktop app"
                                                        description="Desktop feature title"
                                                        id="tw.home.desktop.title"
                                                    />
                                                </h3>
                                            </div>
                                            <p className={styles.featureDesc}>
                                                <FormattedMessage
                                                    defaultMessage="A Windows app that opens local projects offline."
                                                    description="Desktop feature description"
                                                    id="tw.home.desktop.desc"
                                                />
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </React.Fragment>
                    </div>
                ) : null}
                {isHomepage && <Footer />}
            </div>
        );
    }
}

Interface.propTypes = {
    intl: intlShape,
    hasCloudVariables: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    description: PropTypes.shape({
        credits: PropTypes.string,
        instructions: PropTypes.string
    }),
    isFullScreen: PropTypes.bool,
    isLoading: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    projectId: PropTypes.string
};

const mapStateToProps = state => ({
    hasCloudVariables: state.scratchGui.tw.hasCloudVariables,
    customStageSize: state.scratchGui.customStageSize,
    description: state.scratchGui.tw.description,
    isFullScreen: state.scratchGui.mode.isFullScreen,
    isLoading: getIsLoading(state.scratchGui.projectState.loadingState),
    isPlayerOnly: state.scratchGui.mode.isPlayerOnly,
    isRtl: state.locales.isRtl,
    projectId: state.scratchGui.projectState.projectId
});

const mapDispatchToProps = () => ({});

const ConnectedInterface = injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(Interface));

const WrappedInterface = compose(
    AppStateHOC,
    ErrorBoundaryHOC('TW Interface'),
    TWProjectMetaFetcherHOC,
    TWStateManagerHOC,
    TWPackagerIntegrationHOC
)(ConnectedInterface);

export default WrappedInterface;

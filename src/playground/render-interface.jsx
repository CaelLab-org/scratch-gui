/**
 * Copyright (C) 2021 Thomas Weber
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
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
        defaultMessage: 'Run Scratch projects faster',
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

const Footer = () => (
    <footer className={styles.footer}>
        <div className={styles.footerContent}>
            <div className={styles.footerText}>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="{APP_NAME} is not affiliated with Scratch, the Scratch Team, or the Scratch Foundation."
                    description="Disclaimer that TurboWarp is not connected to Scratch"
                    id="tw.footer.disclaimer"
                    values={{
                        APP_NAME
                    }}
                />
            </div>

            <div className={styles.footerText}>
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
            </div>

            <div className={styles.footerColumns}>
                <div className={styles.footerSection}>
                    <a href={`${getCurrentLocalePrefix()}/credits`}>
                        <FormattedMessage
                            defaultMessage="Credits"
                            description="Credits link in footer"
                            id="tw.footer.credits"
                        />
                    </a>
                </div>
                <div className={styles.footerSection}>
                    <a href="/desktop/">{'XCE Desktop'}</a>
                    <a href="https://packager.xmuer.online/">{'XMUER Coding Packager'}</a>
                    <a href="https://coding.xmuer.online/">{'XMUER Coding Community'}</a>
                </div>
                <div className={styles.footerSection}>
                    <a href="https://forum.xmuer.online/t/problem" target="_blank" rel="noreferrer">
                        {'反馈与漏洞提交'}
                    </a>
                    <a href="https://github.com/yunyun-3782/scratch-gui" target="_blank" rel="noreferrer">
                        {'源代码'}
                    </a>
                    <a href="privacy.html">
                        {'隐私政策'}
                    </a>
                </div>
            </div>
            <div className={styles.footerText}>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="XCE 的诞生离不开 {turbowarp} 开源项目。"
                    description="TurboWarp credit in footer"
                    id="tw.footer.turbowarpCredit"
                    values={{
                        turbowarp: (
                            <a href="https://turbowarp.org/" target="_blank" rel="noreferrer">
                                {'TurboWarp'}
                            </a>
                        )
                    }}
                />
            </div>
        </div>
    </footer>
);

class Interface extends React.Component {
    constructor (props) {
        super(props);
        this.handleUpdateProjectTitle = this.handleUpdateProjectTitle.bind(this);
    }
    componentDidUpdate (prevProps) {
        if (prevProps.isLoading && !this.props.isLoading) {
            loadServiceWorker();
        }
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
                    {isHomepage ? null : (
                        <React.Fragment>
                            {isBrowserSupported() ? null : (
                                <BrowserModal isRtl={isRtl} />
                            )}
                            {(
                                // eslint-disable-next-line max-len
                                description.instructions === 'unshared' || description.credits === 'unshared'
                            ) && (
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
                            {/* Hero Section */}
                            <div className={styles.heroSection}>
                                <img
                                    src={xceLogo}
                                    alt="XMUER Coding Engine"
                                    className={styles.heroLogo}
                                />
                                <h1 className={styles.heroTitle}>{APP_NAME}</h1>
                                <p className={styles.heroSubtitle}>
                                    <FormattedMessage
                                        defaultMessage="A Scratch mod that compiles projects to JavaScript for blazing fast performance. Dark mode, addons, and more."
                                        description="Hero subtitle on homepage"
                                        id="tw.hero.subtitle"
                                    />
                                </p>
                            </div>

                            {/* Input Section */}
                            <div className={styles.inputSection}>
                                <div className={styles.inputCard}>
                                    <span className={styles.inputLabel}>
                                        <FormattedMessage
                                            defaultMessage="Enter a Scratch project ID or URL to get started"
                                            description="Label above project input"
                                            id="tw.input.label"
                                        />
                                    </span>
                                    <div className={styles.inputWrapper}>
                                        <ProjectInput />
                                    </div>
                                </div>
                            </div>

                            {(
                                // eslint-disable-next-line max-len
                                description.instructions === 'unshared' || description.credits === 'unshared'
                            ) && (
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

                            {/* Features Section */}
                            <div className={styles.featuresSection}>
                                <div className={styles.featureCard}>
                                    <div className={styles.featureIcon}>{'\u26A1'}</div>
                                    <div className={styles.featureTitle}>
                                        <FormattedMessage
                                            defaultMessage="Blazing Fast"
                                            description="Feature card title"
                                            id="tw.feature.fast"
                                        />
                                    </div>
                                    <div className={styles.featureDesc}>
                                        <FormattedMessage
                                            defaultMessage="Compiles Scratch projects to JavaScript for 10-100x faster execution."
                                            description="Feature card description"
                                            id="tw.feature.fast.desc"
                                        />
                                    </div>
                                </div>
                                <div className={styles.featureCard}>
                                    <div className={styles.featureIcon}>{'\uD83C\uDF19'}</div>
                                    <div className={styles.featureTitle}>
                                        <FormattedMessage
                                            defaultMessage="Dark Mode"
                                            description="Feature card title"
                                            id="tw.feature.dark"
                                        />
                                    </div>
                                    <div className={styles.featureDesc}>
                                        <FormattedMessage
                                            defaultMessage="Easy on your eyes with a built-in dark theme and customizable accents."
                                            description="Feature card description"
                                            id="tw.feature.dark.desc"
                                        />
                                    </div>
                                </div>
                                <div className={styles.featureCard}>
                                    <div className={styles.featureIcon}>{'\uD83E\uDDE9'}</div>
                                    <div className={styles.featureTitle}>
                                        <FormattedMessage
                                            defaultMessage="Addons"
                                            description="Feature card title"
                                            id="tw.feature.addons"
                                        />
                                    </div>
                                    <div className={styles.featureDesc}>
                                        <FormattedMessage
                                            defaultMessage="Hundreds of community addons to customize your editor experience."
                                            description="Feature card description"
                                            id="tw.feature.addons.desc"
                                        />
                                    </div>
                                </div>
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

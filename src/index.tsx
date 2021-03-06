import React, {Component} from "react";
import {Image, ImageProperties, ImageURISource, Platform} from "react-native";
import RNFetchBlob from "react-native-fetch-blob";
const SHA1 = require("crypto-js/sha1");

const dirs = RNFetchBlob.fs.dirs;
const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);

export type CacheHandler = (path: string) => void;

type CacheEntry = {
    downloading: boolean;
    handlers: CacheHandler[];
    path: string | undefined;
    immutable: boolean;
    task?: any;
};

export class ImageCache {

    private getPath(uri: string, immutable?: boolean): string {
        const ext = uri.substring(uri.lastIndexOf("."));
        if (immutable === true) {
            return dirs.CacheDir + "/" + SHA1(uri) + ext;
        } else {
            return dirs.CacheDir + "/" + s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4() + ext;
        }
    }

    private static instance: ImageCache;

    private constructor() {}

    static getCache(): ImageCache {
        if (!ImageCache.instance) {
            ImageCache.instance = new ImageCache();
        }
        return ImageCache.instance;
    }

    private cache: { [uri: string]: CacheEntry } = {};

    on(uri: string, handler: CacheHandler, immutable?: boolean) {
        if (!this.cache[uri]) {
            this.cache[uri] = {
                downloading: false,
                handlers: [handler],
                immutable: immutable === true,
                path: immutable === true ? this.getPath(uri, immutable) : undefined
            };
        } else {
            this.cache[uri].handlers.push(handler);
        }
        this.get(uri);
    }

    dispose(uri: string, handler: CacheHandler) {
        const cache = this.cache[uri];
        if (cache) {
            cache.handlers.forEach((h, index) => {
                if (h === handler) {
                    cache.handlers.splice(index, 1);
                }
            });
        }
    }

    bust(uri: string) {
        const cache = this.cache[uri];
        if (cache !== undefined && !cache.immutable) {
            cache.path = undefined;
            this.get(uri);
        }
    }

    cancel(uri: string) {
        const cache = this.cache[uri];
        if (cache && cache.downloading) {
            cache.task.cancel();
        }
    }

    private download(uri: string, cache: CacheEntry) {
        if (!cache.downloading) {
            const path = this.getPath(uri, cache.immutable);
            cache.downloading = true;
            cache.task = RNFetchBlob.config({ path }).fetch("GET", uri, {});
            cache.task.then(() => {
                cache.downloading = false;
                cache.path = path;
                this.notify(uri);
            }).catch(() => cache.downloading = false);
        }
    }

    private get(uri: string) {
        const cache = this.cache[uri];
        if (cache.path) {
            // We check here if IOS didn't delete the cache content
            RNFetchBlob.fs.exists(cache.path).then((exists: boolean) => {
                if (exists) {
                    this.notify(uri);
                } else {
                    this.download(uri, cache);
                }
            });
        } else {
            this.download(uri, cache);
        }

    }

    private notify(uri: string) {
        const handlers = this.cache[uri].handlers;
        handlers.forEach(handler => {
            handler(this.cache[uri].path as string);
        });
    }
}

export interface CachedImageProps extends ImageProperties {
    mutable?: boolean;
}

export interface CachedImageState {
    path: string | undefined;
}

export class CachedImage extends Component<CachedImageProps, CachedImageState>  {

    private uri: string;
    private static readonly filePrefix = Platform.OS === "ios" ? "" : "file://";

    private handler: CacheHandler = (path: string) => {
        this.setState({ path });
    }

    constructor() {
        super();
        this.state = { path: undefined };
    }

    private dispose() {
        if (this.uri) {
            ImageCache.getCache().dispose(this.uri, this.handler);
        }
    }

    private observe(uri: string, mutable: boolean) {
        if (uri !== this.uri) {
            this.dispose();
            this.uri = uri;
            ImageCache.getCache().on(uri, this.handler, !mutable);
        }
    }

    componentWillMount() {
        const {mutable} = this.props;
        const source = this.props.source as ImageURISource;
        this.observe(source.uri as string, mutable === true);
    }

    componentWillReceiveProps(nextProps: CachedImageProps) {
        const {source, mutable} = nextProps;
        this.observe((source as ImageURISource).uri as string, mutable === true);
    }

    componentWillUnmount() {
        this.dispose();
    }

    render() {
        const {style, blurRadius} = this.props;
        const source = this.state.path ? { uri: CachedImage.filePrefix + this.state.path } : {};
        return <Image style={style} blurRadius={blurRadius} source={source}>{this.props.children}</Image>;
    }
}

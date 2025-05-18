import archiver from "archiver";
import {Jimp} from "jimp";
import {Resvg, initWasm} from '@resvg/resvg-wasm'
import wasm from '@resvg/resvg-wasm/index_bg.wasm'
await initWasm(wasm)

import { createZip } from 'littlezipper'; 
import { remove as diacritics } from "diacritics";
import Mustache from "mustache";
import { encodeXML } from "entities";
import fsExtra from "fs-extra";
import { Element } from "hast";
import { imageSize } from "image-size";
import mime from "mime";
import { basename, dirname, resolve } from "path";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import { Plugin, unified } from "unified";
import { visit } from "unist-util-visit";
import { fileURLToPath } from "url";
import uslug from "uslug";

import templatecss from "../templates/template.css.txt"
import contentOpfTemplate from "../templates/epub3/content.opf.txt"
import contentXhtmlTemplate from "../templates/content.xhtml.txt"
import coverXhtmlTemplate from "../templates/epub3/cover.xhtml.txt"
import tocXhtmlTemplate from "../templates/epub3/toc.xhtml.txt"
import tocNcxTemplate from "../templates/toc.ncx.txt"

type Files = Map<string, string | ArrayBuffer>;

// Allowed HTML attributes & tags
export const defaultAllowedAttributes = [
  "content",
  "alt",
  "id",
  "title",
  "src",
  "href",
  "about",
  "accesskey",
  "aria-activedescendant",
  "aria-atomic",
  "aria-autocomplete",
  "aria-busy",
  "aria-checked",
  "aria-controls",
  "aria-describedat",
  "aria-describedby",
  "aria-disabled",
  "aria-dropeffect",
  "aria-expanded",
  "aria-flowto",
  "aria-grabbed",
  "aria-haspopup",
  "aria-hidden",
  "aria-invalid",
  "aria-label",
  "aria-labelledby",
  "aria-level",
  "aria-live",
  "aria-multiline",
  "aria-multiselectable",
  "aria-orientation",
  "aria-owns",
  "aria-posinset",
  "aria-pressed",
  "aria-readonly",
  "aria-relevant",
  "aria-required",
  "aria-selected",
  "aria-setsize",
  "aria-sort",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",
  "className",
  "content",
  "contenteditable",
  "contextmenu",
  "controls",
  "datatype",
  "dir",
  "draggable",
  "dropzone",
  "hidden",
  "hreflang",
  "id",
  "inlist",
  "itemid",
  "itemref",
  "itemscope",
  "itemtype",
  "lang",
  "media",
  "ns1:type",
  "ns2:alphabet",
  "ns2:ph",
  "onabort",
  "onblur",
  "oncanplay",
  "oncanplaythrough",
  "onchange",
  "onclick",
  "oncontextmenu",
  "ondblclick",
  "ondrag",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondragstart",
  "ondrop",
  "ondurationchange",
  "onemptied",
  "onended",
  "onerror",
  "onfocus",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeypress",
  "onkeyup",
  "onload",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "onmousedown",
  "onmousemove",
  "onmouseout",
  "onmouseover",
  "onmouseup",
  "onmousewheel",
  "onpause",
  "onplay",
  "onplaying",
  "onprogress",
  "onratechange",
  "onreadystatechange",
  "onreset",
  "onscroll",
  "onseeked",
  "onseeking",
  "onselect",
  "onshow",
  "onstalled",
  "onsubmit",
  "onsuspend",
  "ontimeupdate",
  "onvolumechange",
  "onwaiting",
  "prefix",
  "property",
  "rel",
  "resource",
  "rev",
  "role",
  "spellcheck",
  "style",
  "tabindex",
  "target",
  "title",
  "type",
  "typeof",
  "vocab",
  "xml:base",
  "xml:lang",
  "xml:space",
  "colspan",
  "rowspan",
  "epub:type",
  "epub:prefix",
];
export const defaultAllowedXhtml11Tags = [
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "address",
  "hr",
  "pre",
  "blockquote",
  "center",
  "ins",
  "del",
  "a",
  "span",
  "bdo",
  "br",
  "em",
  "strong",
  "dfn",
  "code",
  "samp",
  "kbd",
  "bar",
  "cite",
  "abbr",
  "acronym",
  "q",
  "sub",
  "sup",
  "tt",
  "i",
  "b",
  "big",
  "small",
  "u",
  "s",
  "strike",
  "basefont",
  "font",
  "object",
  "param",
  "img",
  "table",
  "caption",
  "colgroup",
  "col",
  "thead",
  "tfoot",
  "tbody",
  "tr",
  "th",
  "td",
  "embed",
  "applet",
  "iframe",
  "img",
  "map",
  "noscript",
  "ns:svg",
  "object",
  "script",
  "table",
  "tt",
  "var",
];

// UUID generation
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface EpubContentOptions {
  title: string;
  data: string;
  url?: string;
  author?: Array<string> | string;
  filename?: string;
  excludeFromToc?: boolean;
  beforeToc?: boolean;
}

export interface EpubOptions {
  title: string;
  description: string;
  cover?: string;
  useFirstImageAsCover?: boolean;
  downloadAudioVideoFiles?: boolean;
  publisher?: string;
  author?: Array<string> | string;
  tocTitle?: string;
  appendChapterTitles?: boolean;
  hideToC?: boolean;
  date?: string;
  lang?: string;
  css?: string;
  fonts?: Array<string>;
  content: Array<EpubContentOptions>;
  version?: number;
  userAgent?: string;
  verbose?: boolean;
  allowedAttributes?: string[];
  allowedXhtml11Tags?: string[];
}

interface EpubContent {
  id: string;
  href: string;
  title: string;
  data: string;
  url: string | null;
  author: Array<string>;
  filePath: string;
  template: string;
  excludeFromToc: boolean;
  beforeToc: boolean;
  isCover: boolean;
}

interface EpubMedia {
  id: string;
  url: string;
  extension: string;
  mediaType: string;
  isCoverImage?: boolean;
}

export class EPub {
  uuid: string;
  title: string;
  description: string;
  cover: string | null;
  useFirstImageAsCover: boolean;
  downloadAudioVideoFiles: boolean;
  coverMediaType: string | null;
  coverExtension: string | null;
  coverDimensions = {
    width: 0,
    height: 0,
  };
  publisher: string;
  author: Array<string>;
  tocTitle: string;
  appendChapterTitles: boolean;
  showToC: boolean;
  date: string;
  lang: string;
  css: string | null;
  fonts: Array<string>;
  content: Array<EpubContent>;
  images: Array<EpubMedia>;
  audioVideo: Array<EpubMedia>;
  version: number;
  userAgent: string;
  verbose: boolean;
  output: string;
  allowedAttributes: string[];
  allowedXhtml11Tags: string[];
  coverMetaContent: string | null;
  startOfContentHref: string;

  constructor(options: EpubOptions, output: string) {
    // File ID
    this.uuid = uuid();

    // Required options
    this.title = options.title;
    this.description = options.description;
    this.output = output;

    // Options with defaults
    this.cover = options.cover ?? null;
    this.useFirstImageAsCover = options.useFirstImageAsCover ?? false;
    this.publisher = options.publisher ?? "anonymous";
    this.author = options.author
      ? typeof options.author === "string"
        ? [options.author]
        : options.author
      : ["anonymous"];
    if (this.author.length === 0) {
      this.author = ["anonymous"];
    }
    this.tocTitle = options.tocTitle ?? "Table Of Contents";
    this.appendChapterTitles = options.appendChapterTitles ?? true;
    this.showToC = options.hideToC !== true;
    this.date = options.date ?? new Date().toISOString();
    this.lang = options.lang ?? "en";
    this.css = options.css ?? null;
    this.fonts = options.fonts ?? [];
    this.version = options.version ?? 3;
    this.downloadAudioVideoFiles = this.version !== 2 ? (options.downloadAudioVideoFiles ?? false) : false; // Disable audio/video downloads for EPUB 2
    this.userAgent =
      options.userAgent ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.105 Safari/537.36";
    this.verbose = options.verbose ?? false;
    this.allowedAttributes = options.allowedAttributes ?? defaultAllowedAttributes;
    this.allowedXhtml11Tags = options.allowedXhtml11Tags ?? defaultAllowedXhtml11Tags;

    // Check the cover image
    if (this.cover !== null) {
      this.coverMediaType = mime.getType(this.cover);
      if (this.coverMediaType === null) {
        throw new Error(`The cover image can't be processed : ${this.cover}`);
      }
      this.coverExtension = mime.getExtension(this.coverMediaType);
      if (this.coverExtension === null) {
        throw new Error(`The cover image can't be processed : ${this.cover}`);
      }
    } else {
      this.coverMediaType = null;
      this.coverExtension = null;
    }

    const loadHtml = (content: string, plugins: Plugin[]) =>
      unified()
        .use(rehypeParse, { fragment: true })
        .use(plugins)
        // Voids: [] is required for epub generation, and causes little/no harm for non-epub usage
        .use(rehypeStringify, { allowDangerousHtml: true, voids: [], collapseBooleanAttributes: false })
        .processSync(content)
        .toString();

    this.images = [];
    this.audioVideo = [];
    this.content = [];

    // Insert cover in content
    if (this.cover) {
      this.content.push({
        id: `item_${this.content.length}`,
        href: "cover.xhtml",
        title: "cover",
        data: "",
        url: null,
        author: [],
        filePath: `OEBPS/cover.xhtml`,
        template: coverXhtmlTemplate,
        excludeFromToc: true,
        beforeToc: true,
        isCover: true,
      });
    }

    // Parse contents & save media
    const contentOffset = this.content.length;
    this.content.push(
      ...options.content.map<EpubContent>((content, i) => {
        const index = contentOffset + i;

        // Get the content URL & path
        let href, filePath;
        if (content.filename === undefined) {
          const titleSlug = uslug(diacritics(content.title || "no title"));
          href = `${index}_${titleSlug}.xhtml`;
          filePath = `OEBPS/${index}_${titleSlug}.xhtml`;
        } else {
          href = content.filename.match(/\.xhtml$/) ? content.filename : `${content.filename}.xhtml`;
          if (content.filename.match(/\.xhtml$/)) {
            filePath = `OEBPS/${content.filename}`;
          } else {
            filePath = `OEBPS/${content.filename}.xhtml`;
          }
        }

        // Content ID & directory
        const id = `item_${index}`;

        // Parse the content
        const html = loadHtml(content.data, [
          () => (tree) => {
            visit(tree, "element", (node: Element) => {
              this.validateElement(index, node);
            });
          },
          () => (tree) => {
            visit(tree, "element", (node: Element) => {
              if (["img", "input"].includes(node.tagName)) {
                this.processMediaTag(index, node, this.images, "images");
              } else if (this.downloadAudioVideoFiles && ["audio", "video"].includes(node.tagName)) {
                this.processMediaTag(index, node, this.audioVideo, "audiovideo");
              }
            });
          },
        ]);

        // Return the EpubContent
        return {
          id,
          href,
          title: content.title,
          data: html,
          url: content.url ?? null,
          author: content.author ? (typeof content.author === "string" ? [content.author] : content.author) : [],
          filePath,
          template: contentXhtmlTemplate,
          excludeFromToc: content.excludeFromToc === true, // Default to false
          beforeToc: content.beforeToc === true, // Default to false
          isCover: false,
        };
      })
    );

    // Prepare the cover meta
    if (this.cover) {
      this.coverMetaContent = "image_cover";
    } else {
      // Check if we can use the first image as a cover
      if (this.useFirstImageAsCover && this.images.length > 0) {
        this.coverMetaContent = "image_0";
        this.images[0].isCoverImage = true; // Flag the image as a cover
      } else {
        this.coverMetaContent = null;
      }
    }

    // Get the link to the start of content
    const firstContentInToc = this.content.find((el) => !el.excludeFromToc);
    if (firstContentInToc === undefined) {
      throw new Error("At least one element have to be included in the ToC!");
    }
    this.startOfContentHref = firstContentInToc.href;
  }

  private validateElement(contentIndex: number, node: Element): void {
    const attrs = node.properties!;
    if (["img", "br", "hr"].includes(node.tagName)) {
      if (node.tagName === "img") {
        node.properties!.alt = node.properties?.alt || "image-placeholder";
      }
    }

    for (const k of Object.keys(attrs)) {
      if (this.allowedAttributes.includes(k)) {
        if (k === "type") {
          if (attrs[k] !== "script") {
            delete node.properties![k];
          }
        } else if (k === "controls") {
          if (attrs[k] === true) {
            node.properties![k] = "Controls";
          }
        }
      } else {
        delete node.properties![k];
      }
    }

    if (this.version === 2) {
      if (!this.allowedXhtml11Tags.includes(node.tagName)) {
        if (this.verbose) {
          console.log(
            `[Warning] (content[${contentIndex}]) ${node.tagName} tag isn't allowed on EPUB 2/XHTML 1.1 DTD.`
          );
        }
        node.tagName = "div";
      }
    }
  }

  private processMediaTag(
    contentIndex: number,
    node: Element,
    mediaArray: Array<EpubMedia>,
    subfolder: string
  ): void {
    const url = node.properties!.src as string | null | undefined;
    if (url === undefined || url === null) {
      return;
    }
    const id = uuid();

    // let extension, id;
    // const media = mediaArray.find((element) => element.url === url);
    // if (media) {
    //   id = media.id;
    //   extension = media.extension;
    // } else {
    //   id = uuid();
      // const mediaType = mime.getType(url.replace(/\?.*/, ""));
      // if (mediaType === null) {
      //   if (this.verbose) {
      //     console.error(
      //       `[Media Error] (content[${contentIndex}]) (subfolder=${subfolder}) The media can't be processed : ${url}`
      //     );
      //   }
      //   return;
      // }
      // extension = mime.getExtension(mediaType);
      // if (extension === null) {
      //   if (this.verbose) {
      //     console.error(
      //       `[Media Error] (content[${contentIndex}]) (subfolder=${subfolder}) The media can't be processed : ${url}`
      //     );
      //   }
      //   return;
      // }

      mediaArray.push({ id, url, extension: "png", mediaType: "image/png" });
    // }
    node.properties!.src = `${subfolder}/${id}.png`;
  }

  async render(): Promise<Uint8Array> {
    const files: Files = new Map();

    if (this.verbose) {
      console.log("Downloading Media...");
    }
    await this.downloadAllMedia(files);

    if (this.verbose) {
      console.log("Making Cover...");
    }
    await this.makeCover(files);

    if (this.verbose) {
      console.log("Generating Template Files.....");
    }
    await this.generateTemplateFiles(files);
      console.log({files});

    if (this.verbose) {
      console.log("Generating Epub Files...");
    }
    return await this.generate(files);
  }

  private async generateTemplateFiles(files: Files) {
    // Create the document's Header
    const docHeader =
      this.version === 2
        ? `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${this.lang}">
`
        : `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${this.lang}">
`;

    // Copy the CSS style
    if (!this.css) {
      this.css = templatecss;
    }
    files.set("OEBPS/style.css", this.css);

    // Copy fonts
    if (this.fonts.length) {
      this.fonts = this.fonts.map((font) => {
        const filename = basename(font);
        fsExtra.copySync(font, `./OEBPS/fonts/${filename}`);
        return filename;
      });
    }

    // Write content files
    for (const content of this.content) {
      const result = Mustache.render(
        content.template,
        {
          ...this,
          ...content,
          bookTitle: this.title,
          docHeader,
          title: encodeXML(this.title),
          author: encodeXML(this.author.length ? this.author.join(",") : this.author as any)
        },
      );
      files.set(content.filePath, result);
    }

    // write meta-inf/container.xml
    files.set(`META-INF/container.xml`, 
      '<?xml version="1.0" encoding="UTF-8" ?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');

    if (this.version === 2) {
      // write meta-inf/com.apple.ibooks.display-options.xml [from pedrosanta:xhtml#6]
      files.set(`META-INF/com.apple.ibooks.display-options.xml`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<display_options>
  <platform name="*">
    <option name="specified-fonts">true</option>
  </platform>
</display_options>
`);
    }

      const date = new Date();

    files.set("OEBPS/content.opf", Mustache.render(contentOpfTemplate, {
        year: date.getFullYear(),
        publisher: this.publisher,
        uuid: this.uuid,
        title: this.title,
        lang: this.lang,
        modified: date.toISOString().split(".")[0]+ "Z",
        creator: this.author.length ? this.author.join(",") : this.author,
        date: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
        coverMetaContent: this.coverMetaContent,
        cover: this.cover,
        coverExtension: this.coverExtension,
        coverMediaType: this.coverMediaType,
        images: this.images,
        content: this.content,
        fonts: this.fonts,
        showToC: this.showToC,
        startOfContentHref: this.startOfContentHref,
    }));

    files.set("OEBPS/toc.ncx", Mustache.render(tocNcxTemplate, this));

    files.set("OEBPS/toc.xhtml", Mustache.render(tocXhtmlTemplate, this));
  }

  private async makeCover(files: Files): Promise<void> {
    if (this.cover === null) {
      return;
    }

    const destPath = `OEBPS/cover.${this.coverExtension}`;

    if (this.cover.slice(0, 4) === "http" || this.cover.slice(0, 2) === "//") {
      try {
        const res = await fetch(this.cover, {
          headers: { "User-Agent": this.userAgent },
        });
        // FIXME: check status etc
        const data = await res.arrayBuffer()
        files.set(destPath, data);
      } catch (err) {
        if (this.verbose) {
          console.error(`The cover image can't be processed : ${this.cover}, ${err}`);
        }
        return;
      }
    } else {
        files.set(destPath, this.cover);
    }

    if (this.verbose) {
      console.log("[Success] cover image downloaded successfully!");
    }
    console.log(files.get(destPath) as any);

    // Retrieve image dimensions
    const result = imageSize(new Uint8Array(files.get(destPath) as any));
    if (!result || !result.width || !result.height) {
      throw new Error(`Failed to retrieve cover image dimensions for "${destPath}"`);
    }

    this.coverDimensions.width = result.width;
    this.coverDimensions.height = result.height;

    if (this.verbose) {
      console.log(`cover image dimensions: ${this.coverDimensions.width} x ${this.coverDimensions.height}`);
    }
  }

  private async downloadMedia(media: EpubMedia, subfolder: string, files: Files): Promise<void> {
    if (media.url.indexOf("file://") === 0) {
      throw new Error("unsupported file scheme")
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let requestAction: any;
    if (media.url.indexOf("http") === 0 || media.url.indexOf("//") === 0) {
      try {
        const res = await fetch(media.url, {
          headers: { "User-Agent": this.userAgent },
        });
        // FIXME: check status etc
        const contentType = res.headers.get("content-type");
        const filename = `OEBPS/${subfolder}/${media.id}.png`;

      if (contentType === "image/svg+xml") {
          const opts = {
              fitTo: {
                  mode: 'width',
                  value: 1300,
              },
          }

          const a = new Resvg(await res.text(), opts as any)
          const pngData = a.render()
          const pngBuffer = pngData.asPng()

        files.set(filename, pngBuffer);
      } else {
        let data = await res.arrayBuffer()
        const image = await Jimp.read(data);

        // https://en.wikipedia.org/wiki/Kobo_eReader
        // 1404 with some margin
        if (image.width > 1300) {
          console.log("image too big, resizing");
          image.resize({ w: 1300 });
          data = await image.getBuffer("image/png");
        }

        // convert image to png because the .png extension is hardcoded
        {
          if (contentType !== "image/png") {
            data = await image.getBuffer("image/png");
          }
        }

        files.set(filename, data);
      }
      } catch (err) {
        if (this.verbose) {
          console.error(`The media can't be processed : ${media.url}, ${err}`);
        }
        return;
      }
    } else {
      throw new Error("todo")
    }
  }

  private async downloadAllMedia(files: Files): Promise<void> {
    if (this.images.length > 0) {
      for (let index = 0; index < this.images.length; index++) {
        await this.downloadMedia(this.images[index], "images", files);
      }
    }
    if (this.audioVideo.length > 0) {
      for (let index = 0; index < this.audioVideo.length; index++) {
        await this.downloadMedia(this.audioVideo[index], "audiovideo", files);
      }
    }
  }

  private async generate(files: Files): Promise<Uint8Array> {
      let filesInZip = [];
      for (const [path, data] of files) {
          filesInZip.push({ path, data });
      }

      return createZip(filesInZip);
  }
}

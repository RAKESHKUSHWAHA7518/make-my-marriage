import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DesignCard } from "../src/components/designs/design-card";
test("template cards escape text, wrap long content and never insert event details",()=>{const html=renderToStaticMarkup(<DesignCard mode="template" draft={{templateKey:"soft",textFields:{heading:"Join us",coupleNames:"<script>alert(1)</script>",message:"Private invitation",closing:""},assetIds:[],layout:{palette:"ivory",font:"modern"}}}/>);assert(html.includes("&lt;script&gt;"));assert(!html.includes("<script>"));assert(!html.includes("Udaipur"));assert(!html.includes("2025"));});
test("image cards use only authenticated same-origin content and show unavailable state",()=>{const html=renderToStaticMarkup(<DesignCard mode="uploaded_image" draft={{assetIds:["a".repeat(24)]}}/>);assert(html.includes(`/api/v1/media/${"a".repeat(24)}/content?variant=gallery`));assert(!html.includes("cloudinary"));assert(!renderToStaticMarkup(<DesignCard mode="uploaded_image" draft={{assetIds:["a".repeat(24)]}} imageAvailable={false}/>).includes("<img"));});

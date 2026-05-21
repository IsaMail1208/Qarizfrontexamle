import { NextResponse } from "next/server";
import sharp from "sharp";
import { getDb, getBucket } from "../../../lib/firebaseAdmin";

// ---------------------------------------------------------------------------
// GET /api/cases?q=&limit=12&cursor=
// ---------------------------------------------------------------------------
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    let limit = parseInt(searchParams.get("limit") || "12", 10);
    const cursor = searchParams.get("cursor") || null;

    if (Number.isNaN(limit) || limit < 1 || limit > 50) {
        return NextResponse.json({ error: "Invalid limit" }, { status: 400 });
    }

    let db;
    try {
        db = getDb();
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }

    const collection = db.collection("cases");

    // --- Search mode ---
    if (q.trim()) {
        const term = q.trim().toLowerCase();

        const nameSnap = await collection
            .orderBy("full_name_lower")
            .startAt(term)
            .endAt(term + "\uf8ff")
            .limit(limit)
            .get();

        const passportSnap = await collection
            .orderBy("passport_data_lower")
            .startAt(term)
            .endAt(term + "\uf8ff")
            .limit(limit)
            .get();

        const unique = new Map();
        for (const doc of nameSnap.docs) {
            unique.set(doc.id, { id: doc.id, ...doc.data() });
        }
        for (const doc of passportSnap.docs) {
            if (!unique.has(doc.id)) {
                unique.set(doc.id, { id: doc.id, ...doc.data() });
            }
        }

        const items = [...unique.values()]
            .sort((a, b) => {
                const ta = a.submitted_at?._seconds ?? 0;
                const tb = b.submitted_at?._seconds ?? 0;
                return tb - ta;
            })
            .slice(0, limit)
            .map(serializeCase);

        return NextResponse.json({ items, next_cursor: null });
    }

    // --- Normal listing with cursor pagination ---
    let query = collection.orderBy("submitted_at", "desc");

    if (cursor) {
        const snap = await collection.doc(cursor).get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
        }
        query = query.startAfter(snap);
    }

    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs;
    const hasMore = docs.length > limit;
    const page = docs.slice(0, limit);

    const items = page.map((doc) => serializeCase({ id: doc.id, ...doc.data() }));
    const next_cursor = hasMore && page.length ? page[page.length - 1].id : null;

    return NextResponse.json({ items, next_cursor });
}

// ---------------------------------------------------------------------------
// POST /api/cases  (multipart/form-data)
// ---------------------------------------------------------------------------
export async function POST(request) {
    let db;
    try {
        db = getDb();
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }

    let formData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json(
            { error: "Invalid form data" },
            { status: 400 }
        );
    }

    const full_name = formData.get("full_name")?.toString() || "";
    const birth_date = formData.get("birth_date")?.toString() || "";
    const passport_data = formData.get("passport_data")?.toString() || "";
    const damage_amount_raw = formData.get("damage_amount")?.toString() || "0";
    const submitted_by = formData.get("submitted_by")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const photo = formData.get("photo");

    // --- Validation ---
    if (full_name.length < 2 || full_name.length > 200) {
        return NextResponse.json(
            { detail: "full_name must be 2-200 chars" },
            { status: 400 }
        );
    }
    if (passport_data.length < 4 || passport_data.length > 200) {
        return NextResponse.json(
            { detail: "passport_data must be 4-200 chars" },
            { status: 400 }
        );
    }
    if (description.length < 5 || description.length > 2000) {
        return NextResponse.json(
            { detail: "description must be 5-2000 chars" },
            { status: 400 }
        );
    }
    if (submitted_by.length < 2 || submitted_by.length > 200) {
        return NextResponse.json(
            { detail: "submitted_by must be 2-200 chars" },
            { status: 400 }
        );
    }

    let parsedDate;
    try {
        parsedDate = new Date(birth_date);
        if (isNaN(parsedDate.getTime())) throw new Error();
    } catch {
        return NextResponse.json(
            { detail: "Invalid birth date" },
            { status: 400 }
        );
    }

    const damage_amount = parseFloat(damage_amount_raw);
    if (isNaN(damage_amount) || damage_amount < 0) {
        return NextResponse.json(
            { detail: "Invalid damage amount" },
            { status: 400 }
        );
    }

    // --- Build document ---
    const submitted_at = new Date();
    const docRef = db.collection("cases").doc();

    const data = {
        full_name,
        birth_date: birth_date,
        passport_data,
        damage_amount,
        submitted_by,
        description,
        submitted_at,
        full_name_lower: full_name.toLowerCase(),
        passport_data_lower: passport_data.toLowerCase(),
        photo_url: null,
    };

    // --- Photo upload ---
    let uploadedBlob = null;
    if (photo && typeof photo.arrayBuffer === "function") {
        const arrayBuf = await photo.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);

        let compressed;
        try {
            compressed = await sharp(buffer)
                .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();
        } catch {
            return NextResponse.json(
                { detail: "Invalid image file" },
                { status: 400 }
            );
        }

        try {
            const bucket = getBucket();
            const blobPath = `cases/${docRef.id}/photo.jpg`;
            uploadedBlob = bucket.file(blobPath);

            await uploadedBlob.save(compressed, {
                metadata: { contentType: "image/jpeg" },
            });

            await uploadedBlob.makePublic();
            data.photo_url = `https://storage.googleapis.com/${bucket.name}/${blobPath}`;
        } catch (err) {
            return NextResponse.json(
                { detail: "Failed to upload photo: " + err.message },
                { status: 500 }
            );
        }
    }

    // --- Write to Firestore ---
    try {
        await docRef.set(data);
    } catch (err) {
        // Rollback photo if Firestore write fails
        if (uploadedBlob) {
            try {
                await uploadedBlob.delete();
            } catch {
                /* ignore */
            }
        }
        return NextResponse.json(
            { detail: "Failed to save case: " + err.message },
            { status: 500 }
        );
    }

    const record = serializeCase({ id: docRef.id, ...data });
    return NextResponse.json(record, { status: 201 });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function serializeCase(data) {
    const out = { ...data };

    // Firestore Timestamps → ISO strings
    if (out.submitted_at && typeof out.submitted_at.toDate === "function") {
        out.submitted_at = out.submitted_at.toDate().toISOString();
    } else if (out.submitted_at instanceof Date) {
        out.submitted_at = out.submitted_at.toISOString();
    } else if (out.submitted_at?._seconds != null) {
        out.submitted_at = new Date(out.submitted_at._seconds * 1000).toISOString();
    }

    // Remove internal search fields from response
    delete out.full_name_lower;
    delete out.passport_data_lower;

    return out;
}

"""
Reader for PB-TEMPORAL-FRAME-v1.

The temporal frame previously had no consumer at all: formatForWire emitted a
shape that intersected neither toPythonWire nor ingest_wire, so handing one to
ingest_wire raised KeyError: 'coordinateCount'. A format nobody reads is the
declared-but-unimplemented pathology this bridge exists to remove, so the
contract gets a reader in the same phase it gets a shape.

This is deliberately NOT ingest_wire. A temporal frame is animation state: it
carries no z and no colour, and inventing either to reuse the render path would
be fabricating data the producer never sent.

Identity lives in ID custom properties, carried and never computed -- the same
law the render ingest follows, for the same reason: datablock names silently
collide-rename.
"""

import bpy

TEMPORAL_FRAME_CONTRACT = "PB-TEMPORAL-FRAME-v1"

FRAME_KEY = "pb_frame"
TIME_KEY = "pb_time"
CHECKSUM_KEY = "pb_projection_checksum"
PART_INDEX_ATTRIBUTE = "pb_part_index"

# Temporal vertices are plane coordinates; the frame declares no depth. Z is set
# to 0 rather than invented, and that choice is recorded here so a reader does
# not mistake a flat frame for a measurement.
TEMPORAL_Z = 0.0


def ingest_temporal_frame(frame_wire):
    """
    Create a point cloud object from a PB-TEMPORAL-FRAME-v1 packet.
    Returns the created object.
    """
    contract = frame_wire.get("contract")
    if contract != TEMPORAL_FRAME_CONTRACT:
        raise ValueError(
            f"expected {TEMPORAL_FRAME_CONTRACT}, got {contract!r}. A render "
            "packet and a temporal frame are different shapes; accepting either "
            "here would mean guessing which one arrived."
        )

    count = int(frame_wire["vertexCount"])
    positions = frame_wire["positions"]
    frame_number = int(frame_wire["frame"])

    pc = bpy.data.pointclouds.new(f"pb_temporal_{frame_number}")
    pc.resize(count)

    flat = []
    for i in range(count):
        flat.extend((float(positions["x"][i]), float(positions["y"][i]), TEMPORAL_Z))
    pc.attributes["position"].data.foreach_set("vector", flat)

    # partId is interned producer-side because a shader cannot read a STRING
    # attribute. The int is what crosses; the table travels beside it.
    part_index = frame_wire.get("partIndex") or []
    if part_index:
        attr = pc.attributes.new(name=PART_INDEX_ATTRIBUTE, type="INT", domain="POINT")
        attr.data.foreach_set("value", list(part_index))

    obj = bpy.data.objects.new(f"pb_temporal_{frame_number}", pc)
    bpy.context.scene.collection.objects.link(obj)

    obj[FRAME_KEY] = frame_number
    obj[TIME_KEY] = float(frame_wire["time"])
    obj[CHECKSUM_KEY] = str(frame_wire["projectionChecksum"])

    return obj


def find_temporal_frame(frame_number):
    """Lookup by custom property. Never by .name — names silently drift."""
    for obj in bpy.data.objects:
        if obj.get(FRAME_KEY) == frame_number:
            return obj
    return None

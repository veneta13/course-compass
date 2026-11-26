"""Small builders for recommender tests."""
import numpy as np

from course_compass.recommender.models import Evaluation, Item


def make_item(item_id="IN0001", **overrides) -> Item:
    values = dict(
        item_id=item_id, module_code=item_id, module_codes=[item_id], passed_codes=[item_id],
        is_umbrella=False, course_ids=[1], main_course_id=1, title=f"Course {item_id}",
        course_type="Lecture", course_types=["Vorlesung"], languages=["EN"],
        description="A course.",
    )
    values.update(overrides)
    return Item(**values)


def make_evaluation(item: Item, score=0.8, **overrides) -> Evaluation:
    values = dict(item=item, scores={}, weights={}, score=score, match=round(100 * score))
    values.update(overrides)
    return Evaluation(**values)


def unit(*values) -> np.ndarray:
    """A normalized vector."""
    v = np.asarray(values, dtype=np.float32)
    return v / np.linalg.norm(v)

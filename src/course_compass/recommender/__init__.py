"""Course recommender: filters, scores and explains courses for a student profile.

Use from an endpoint:

    from course_compass.recommender import recommend, match_course, profile_insights

    response = await recommend(pool, profile_payload, "master-informatics")

See service.py for the three functions and README.md in this folder for the
approach and the commands that prepare the data.
"""
from .service import UnknownCourse, UnknownDegree, match_course, profile_insights, recommend

__all__ = ["recommend", "match_course", "profile_insights", "UnknownDegree", "UnknownCourse"]

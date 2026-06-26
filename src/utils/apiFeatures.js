class ApiFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
    this.pagination = null;
  }

  search() {
    const escapeRegex = require("./escapeRegex");
    const searchTerm = this.queryString.search?.trim();

    if (!searchTerm) {
      return this;
    }

    const capped = searchTerm.slice(0, 100);
    const regex = new RegExp(escapeRegex(capped), "i");

    this.query = this.query.find({
      $or: [{ title: regex }, { tags: regex }, { aiTool: regex }],
    });

    return this;
  }

  filter() {
    const filterFields = ["category", "aiTool", "difficulty"];
    const filters = {};

    for (const field of filterFields) {
      const value = this.queryString[field];

      if (typeof value === "string" && value.trim()) {
        filters[field] = value.trim();
      }
    }

    if (Object.keys(filters).length > 0) {
      this.query = this.query.find(filters);
    }

    return this;
  }

  sort() {
    const sortValue = this.queryString.sort;

    if (sortValue === "popular") {
      this.query = this.query.sort({ averageRating: -1, reviewCount: -1, createdAt: -1 });
    } else if (sortValue === "copies") {
      this.query = this.query.sort({ copyCount: -1, createdAt: -1 });
    } else if (sortValue === "latest") {
      this.query = this.query.sort({ createdAt: -1 });
    } else {
      this.query = this.query.sort({ createdAt: -1 });
    }

    return this;
  }

  paginate() {
    const { clampPage, clampLimit } = require("./pagination");
    const page = clampPage(this.queryString.page);
    const limit = clampLimit(this.queryString.limit);
    const skip = (page - 1) * limit;

    this.pagination = {
      page,
      limit,
      skip,
    };

    this.query = this.query.skip(skip).limit(limit);

    return this;
  }

  getFilter() {
    return this.query.getFilter();
  }

  async countDocuments(Model) {
    return Model.countDocuments(this.getFilter());
  }

  async getPaginationInfo(totalCount) {
    const { page, limit } = this.pagination;
    return {
      page,
      limit,
      totalCount,
      totalPages: Math.max(Math.ceil(totalCount / limit), 1),
      hasNextPage: page * limit < totalCount,
      hasPrevPage: page > 1,
    };
  }
}

module.exports = ApiFeatures;

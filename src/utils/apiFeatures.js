class ApiFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
    this.pagination = null;
  }

  search() {
    const searchTerm = this.queryString.search?.trim();

    if (!searchTerm) {
      return this;
    }

    const regex = new RegExp(searchTerm, "i");

    this.query = this.query.find({
      $or: [{ title: regex }, { tags: regex }, { aiTool: regex }],
    });

    return this;
  }

  filter() {
    const filterFields = ["category", "aiTool", "difficulty"];
    const filters = {};

    for (const field of filterFields) {
      if (this.queryString[field]) {
        filters[field] = this.queryString[field];
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
    const page = Math.max(parseInt(this.queryString.page, 10) || 1, 1);
    const limit = Math.max(parseInt(this.queryString.limit, 10) || 10, 1);
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

  // Separate method to get pagination info after query execution
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